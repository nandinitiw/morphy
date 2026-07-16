"""
Seed a demo user with pre-baked game + blunder data so recruiters can
explore the full product without a Chess.com account.

Usage:
    cd backend
    python -m demo.seed_demo          # seed (idempotent)
    python -m demo.seed_demo --reset  # wipe demo data first
"""

from __future__ import annotations

import argparse
import random
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import chess
import chess.pgn
import io

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.database import SessionLocal, engine
from db.models import Base, Game, Position, WeaknessProfile

DEMO_USER = "demo"
random.seed(42)  # deterministic demo data

# ── Opening library ──────────────────────────────────────────────────────────

OPENINGS: list[dict] = [
    {
        "name": "Italian Game",
        "eco": "C54",
        "color": "white",
        "pgn": "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d4 exd4 6.cxd4 Bb4+ 7.Nc3 Nxe4 8.O-O",
        "result": "win",
    },
    {
        "name": "Sicilian Defense: Najdorf",
        "eco": "B90",
        "color": "black",
        "pgn": "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Be3 e5 7.Nb3 Be7 8.f3",
        "result": "win",
    },
    {
        "name": "French Defense: Advance",
        "eco": "C02",
        "color": "black",
        "pgn": "1.e4 e6 2.d4 d5 3.e5 c5 4.c3 Nc6 5.Nf3 Qb6 6.a3 c4 7.Nbd2 Na5",
        "result": "loss",
    },
    {
        "name": "Queen's Gambit Declined",
        "eco": "D37",
        "color": "black",
        "pgn": "1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Nf3 Be7 5.Bf4 O-O 6.e3 c5 7.dxc5 Bxc5 8.Qc2",
        "result": "draw",
    },
    {
        "name": "King's Indian Defense",
        "eco": "E62",
        "color": "black",
        "pgn": "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.Nf3 O-O 5.g3 d6 6.Bg2 Nc6 7.O-O e5 8.d5",
        "result": "win",
    },
    {
        "name": "Caro-Kann Defense",
        "eco": "B12",
        "color": "black",
        "pgn": "1.e4 c6 2.d4 d5 3.e5 Bf5 4.Nf3 e6 5.Be2 Ne7 6.O-O Nd7 7.Nbd2",
        "result": "loss",
    },
    {
        "name": "London System",
        "eco": "D02",
        "color": "white",
        "pgn": "1.d4 d5 2.Nf3 Nf6 3.Bf4 e6 4.e3 c5 5.c3 Nc6 6.Nbd2 Bd6 7.Bg3 O-O 8.Bd3",
        "result": "win",
    },
    {
        "name": "Ruy Lopez: Berlin",
        "eco": "C65",
        "color": "white",
        "pgn": "1.e4 e5 2.Nf3 Nc6 3.Bb5 Nf6 4.O-O Nxe4 5.d4 Nd6 6.Bxc6 dxc6 7.dxe5 Nf5 8.Qxd8+",
        "result": "win",
    },
    {
        "name": "Catalan Opening",
        "eco": "E06",
        "color": "white",
        "pgn": "1.d4 Nf6 2.c4 e6 3.g3 d5 4.Bg2 Be7 5.Nf3 O-O 6.O-O dxc4 7.Qc2 a6 8.a4",
        "result": "win",
    },
    {
        "name": "Nimzo-Indian Defense",
        "eco": "E32",
        "color": "black",
        "pgn": "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.Qc2 O-O 5.a3 Bxc3+ 6.Qxc3 b6 7.Bg5 Bb7 8.e3",
        "result": "draw",
    },
]

# ── Tactical positions ───────────────────────────────────────────────────────
# Each entry: play out the PGN to get the board, then define the blunder.
# move_played and best_move are in UCI format; both must be legal in the position.

TACTICAL_BLUNDERS: list[dict] = [
    # missed_fork: Knight fork opportunities
    {
        # Black to move after 9.Nf3; Na5 is offside, should reroute via c4
        "theme": "missed_fork",
        "opening_pgn": "1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5 d5 5.exd5 Na5 6.Bb5+ c6 7.dxc6 bxc6 8.Be2 h6 9.Nf3",
        "move_played": "f8e7",   # Be7 (passive, misses Na5 reroute)
        "best_move":   "a5c4",   # Nc4 (forks b2 and d2, gains tempo)
        "centipawn_loss": 220,
        "classification": "blunder",
    },
    {
        # Black to move — use FEN directly to avoid SAN ambiguity in PGN parse
        "theme": "missed_fork",
        "fen": "r1bq1rk1/p1p2ppp/5n2/3p2B1/1b6/2NB4/PPP2PPP/R2Q1RK1 b - - 3 10",
        "move_played": "f6d7",   # Nd7 (passive retreat)
        "best_move":   "f6e4",   # Ne4 (attacks bishop, forks)
        "centipawn_loss": 310,
        "classification": "blunder",
    },
    # missed_pin
    {
        "theme": "missed_pin",
        "opening_pgn": "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3 d6 8.c3 O-O 9.h3 Na5 10.Bc2 c5 11.d4",
        "move_played": "c5d4",   # cxd4 (exchanges, releases tension)
        "best_move":   "f8e8",   # Re8 (pins the e-pawn, keeps tension)
        "centipawn_loss": 145,
        "classification": "mistake",
    },
    {
        "theme": "missed_pin",
        "opening_pgn": "1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3 e6 5.e3 a6 6.b3 Bb4 7.Bd2 Nbd7 8.Be2 O-O 9.O-O Bd6 10.Qc2",
        "move_played": "d7e5",   # Ne5 (premature)
        "best_move":   "f8e8",   # Re8 (prepares e5 with support)
        "centipawn_loss": 130,
        "classification": "mistake",
    },
    # king_safety
    {
        "theme": "king_safety",
        "opening_pgn": "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Bg5 e6 7.f4 Be7 8.Qf3 Qc7 9.O-O-O Nbd7 10.g4 b5 11.Bxf6 Nxf6 12.g5 Nd7 13.f5",
        "move_played": "e6f5",   # exf5 (opens lines toward own king)
        "best_move":   "d7e5",   # Ne5 (blockades instead)
        "centipawn_loss": 280,
        "classification": "blunder",
    },
    {
        "theme": "king_safety",
        "opening_pgn": "1.e4 e5 2.Nc3 Nf6 3.f4 d5 4.fxe5 Nxe4 5.Nf3 Nc6 6.d4 Bg4 7.Be3 Bb4 8.Qd3 Bxf3 9.gxf3 Nxc3 10.bxc3 Bxc3+",
        "move_played": "e1d1",   # Kd1 (king walks into danger)
        "best_move":   "d3c3",   # Qxc3 (queen recaptures safely)
        "centipawn_loss": 350,
        "classification": "blunder",
    },
    # back_rank
    {
        "theme": "back_rank",
        "opening_pgn": "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.O-O Nf6 5.d3 O-O 6.Bg5 h6 7.Bh4 d6 8.Nc3 Be6 9.Bxe6 fxe6 10.Nd5 Nxd5 11.exd5 Ne7 12.c3 c6 13.dxc6 Nxc6 14.d4 exd4 15.cxd4 Bb6 16.Re1",
        "move_played": "d8d7",   # Qd7 (misses the threat)
        "best_move":   "f8f7",   # Rf7 (defends back rank)
        "centipawn_loss": 400,
        "classification": "blunder",
    },
    {
        "theme": "back_rank",
        "opening_pgn": "1.d4 d5 2.c4 c6 3.Nc3 Nf6 4.Nf3 e6 5.e3 Nbd7 6.Bd3 dxc4 7.Bxc4 b5 8.Bd3 Bb7 9.e4 b4 10.Na4 c5 11.e5 Nd5 12.O-O Qc7 13.Re1",
        "move_played": "c5d4",   # cxd4 (back rank loose)
        "best_move":   "e8c8",   # O-O-O (castles, secures king)
        "centipawn_loss": 260,
        "classification": "blunder",
    },
    # positional
    {
        "theme": "positional",
        "opening_pgn": "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.e3 O-O 5.Bd3 d5 6.Nf3 c5 7.O-O Nc6 8.a3 Bxc3 9.bxc3 dxc4 10.Bxc4 Qc7 11.Bd3 e5",
        "move_played": "d4e5",   # dxe5 (gives up center)
        "best_move":   "d4d5",   # d5 (grabs space)
        "centipawn_loss": 95,
        "classification": "inaccuracy",
    },
    {
        "theme": "positional",
        "opening_pgn": "1.e4 e6 2.d4 d5 3.Nc3 Nf6 4.e5 Nfd7 5.f4 c5 6.Nf3 Nc6 7.Be3 cxd4 8.Nxd4 Bc5 9.Qd2 O-O 10.O-O-O a6",
        "move_played": "d4c6",   # Nxc6 (releases tension prematurely)
        "best_move":   "d4b3",   # Nb3 (retreats, keeps bishop pair pressure)
        "centipawn_loss": 110,
        "classification": "inaccuracy",
    },
    # endgame
    {
        # FEN used directly — long PGN has ambiguous Rxf8 when two rooks can capture
        "theme": "endgame",
        "fen": "1rb1k2r/2qnb1p1/p2p2p1/1p6/3N4/2N2Q2/PPP4P/2KR1B1R w k - 0 17",
        "move_played": "d4b3",   # Nb3 (passive retreat)
        "best_move":   "d4e6",   # Ne6 (forks Qc7 and Rb8)
        "centipawn_loss": 450,
        "classification": "blunder",
    },
    {
        # FEN used directly — original had white Rf2 move on black's turn
        "theme": "endgame",
        "fen": "r1b2rk1/pp3ppp/5n2/2p1q3/5P2/P1PBP3/6PP/R1BQ1RK1 b - - 0 14",
        "move_played": "f8e8",   # Re8 (passive, misses initiative)
        "best_move":   "e5d5",   # Qd5 (dominant central queen)
        "centipawn_loss": 180,
        "classification": "mistake",
    },
]


def board_from_pgn(pgn_str: str) -> chess.Board:
    game = chess.pgn.read_game(io.StringIO(pgn_str))
    board = game.board()
    for move in game.mainline_moves():
        board.push(move)
    return board


def _pgn_result(result: str, color: str) -> str:
    """Map a stored result ("win"/"loss"/"draw") + player colour to a PGN Result tag."""
    if result == "draw":
        return "1/2-1/2"
    won_as_white = (result == "win") == (color == "white")
    return "1-0" if won_as_white else "0-1"


def make_game_record(opening: dict, game_num: int, base_date: datetime) -> Game:
    played_at = base_date - timedelta(days=game_num * 2 + random.randint(0, 1))
    color = opening["color"]
    opp = f"demo_opponent_{game_num}"

    board = board_from_pgn(opening["pgn"])
    pgn_game = chess.pgn.read_game(io.StringIO(opening["pgn"]))
    # Inject demo username into headers so compute_style can match the player
    if color == "white":
        pgn_game.headers["White"] = DEMO_USER
        pgn_game.headers["Black"] = opp
    else:
        pgn_game.headers["White"] = opp
        pgn_game.headers["Black"] = DEMO_USER
    # Mirror the result into the PGN header. The source fixtures carry
    # Result "*", which reads as "no decided games" and zeroes the
    # decisiveness axis for the demo user.
    pgn_game.headers["Result"] = _pgn_result(opening["result"], color)
    pgn_str = str(pgn_game)

    return Game(
        id=f"demo_{game_num:04d}",
        username=DEMO_USER,
        player_color=color,
        result=opening["result"],
        time_control="600+0",
        eco=opening["eco"],
        opening_name=opening["name"],
        played_at=played_at,
        raw_pgn=pgn_str,
        analyzed=True,
    )


def make_position(blunder: dict, game_id: str, move_number: int) -> Position | None:
    try:
        if "fen" in blunder:
            board = chess.Board(blunder["fen"])
        else:
            board = board_from_pgn(blunder["opening_pgn"])
    except Exception:
        return None

    # Verify both moves are legal
    try:
        played = chess.Move.from_uci(blunder["move_played"])
        best = chess.Move.from_uci(blunder["best_move"])
        if played not in board.legal_moves or best not in board.legal_moves:
            print(f"[demo] WARNING: illegal move in theme={blunder['theme']}, skipping")
            return None
    except Exception:
        return None

    return Position(
        game_id=game_id,
        fen=board.fen(),
        move_number=move_number,
        move_played=blunder["move_played"],
        best_move=blunder["best_move"],
        centipawn_loss=float(blunder["centipawn_loss"] + random.randint(-20, 20)),
        classification=blunder["classification"],
        is_your_move=True,
        tactical_motif=blunder["theme"],
    )


def build_weakness_profiles(positions: list[Position]) -> list[WeaknessProfile]:
    theme_data: dict[str, list[float]] = {}
    for pos in positions:
        if pos.tactical_motif:
            theme_data.setdefault(pos.tactical_motif, []).append(pos.centipawn_loss or 0)

    profiles = []
    now = datetime.now()
    for theme, losses in theme_data.items():
        profiles.append(WeaknessProfile(
            username=DEMO_USER,
            theme=theme,
            frequency=len(losses),
            severity=sum(losses) / len(losses),
            last_seen=now - timedelta(days=random.randint(0, 14)),
            updated_at=now,
        ))
    return profiles


def seed(reset: bool = False) -> None:
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        if reset:
            db.query(WeaknessProfile).filter_by(username=DEMO_USER).delete()
            # Delete positions via games
            game_ids = [g.id for g in db.query(Game.id).filter_by(username=DEMO_USER).all()]
            if game_ids:
                db.query(Position).filter(Position.game_id.in_(game_ids)).delete(synchronize_session=False)
            db.query(Game).filter_by(username=DEMO_USER).delete()
            db.commit()
            print("[demo] Cleared existing demo data.")

        # Skip if already seeded
        existing = db.query(Game).filter_by(username=DEMO_USER).count()
        if existing > 0 and not reset:
            print(f"[demo] Demo user already has {existing} games. Use --reset to re-seed.")
            return

        base_date = datetime.now()
        games: list[Game] = []
        positions: list[Position] = []

        # Create ~30 games by cycling through openings
        for i in range(30):
            opening = OPENINGS[i % len(OPENINGS)]
            # Vary results slightly (overall 60% win rate)
            varied = dict(opening)
            roll = random.random()
            if roll < 0.60:
                varied["result"] = "win"
            elif roll < 0.85:
                varied["result"] = "loss"
            else:
                varied["result"] = "draw"

            game = make_game_record(varied, i, base_date)
            games.append(game)

        db.add_all(games)
        db.flush()

        # Distribute blunders across games (2–5 blunders per game)
        game_ids = [g.id for g in games]
        blunder_idx = 0
        for game_id in game_ids:
            n = random.randint(2, 5)
            for j in range(n):
                blunder = TACTICAL_BLUNDERS[blunder_idx % len(TACTICAL_BLUNDERS)]
                blunder_idx += 1
                pos = make_position(blunder, game_id, move_number=random.randint(10, 35))
                if pos:
                    positions.append(pos)

        db.add_all(positions)
        db.flush()

        profiles = build_weakness_profiles(positions)
        db.add_all(profiles)
        db.commit()

        print(f"[demo] Seeded {len(games)} games, {len(positions)} positions, {len(profiles)} weakness themes.")
        for p in sorted(profiles, key=lambda x: -x.frequency):
            print(f"  {p.theme}: {p.frequency}× · avg {p.severity:.0f}cp loss")

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Wipe and re-seed demo data")
    args = parser.parse_args()
    seed(reset=args.reset)

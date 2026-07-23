"""
Compute 5 style axes from a PGN corpus for a named player.

Axes (all 0–100):
  decisiveness     – % of games that end decisively rather than drawn
  endgame_tendency – % of games played down into an endgame
  patience         – average game length (grinders play long, attackers short)
  simplification   – how much material gets traded off by game's end
  attack           – check frequency; proxy for attacking/tactical play

Axis choice note: the axes are chosen to *separate grandmasters from each other*,
not just Morphy from everyone. Metrics that measure competence rather than style —
development speed, rook-on-open-file rate, king-attack-zone frequency — converge
among elite players (they all do them well) and made four of the five radars
near-identical, so they are computed only as stats, never as axes. The five axes
above each have real spread across the corpora, verified in
tests/test_compute_style.py; normalization windows are fitted to that measured
spread (e.g. Carlsen reaches an endgame in 40% of games vs Tal's 21%; Carlsen's
games run ~46 moves vs Morphy's ~32).
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass, field

import chess
import chess.pgn

PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 0,
}

WHITE_MINOR_START = frozenset([chess.B1, chess.G1, chess.C1, chess.F1])
BLACK_MINOR_START = frozenset([chess.B8, chess.G8, chess.C8, chess.F8])


# Total non-king material at the start of a game (2 × 39).
STARTING_MATERIAL = 78
# A game "reached an endgame" if this much material or less is left at the end.
# ~20 means queens are off and only a few pieces remain.
ENDGAME_MATERIAL = 20


@dataclass
class _Accum:
    dev_moves: list[int] = field(default_factory=list)
    total_moves: int = 0
    captures: int = 0
    checks: int = 0          # moves that give check — proxy for tactical/sacrificial play
    king_attack: int = 0
    rook_moves: int = 0
    rook_open_file: int = 0
    pawn_advances: int = 0
    enemy_half_moves: int = 0
    game_lengths: list[int] = field(default_factory=list)
    decisive_games: int = 0   # games ending 1-0 or 0-1
    decided_games: int = 0    # games with a non-"*" result
    endgame_games: int = 0    # games reaching ENDGAME_MATERIAL or less
    finished_games: int = 0   # games whose final position we measured
    final_materials: list[int] = field(default_factory=list)  # material left at game end


def _material(board: chess.Board) -> int:
    """Total non-king material on the board."""
    return sum(
        PIECE_VALUES[pt] * len(board.pieces(pt, color))
        for pt in (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
        for color in (chess.WHITE, chess.BLACK)
    )


def _is_open_file(board: chess.Board, file_idx: int) -> bool:
    for rank in range(8):
        sq = chess.square(file_idx, rank)
        p = board.piece_at(sq)
        if p and p.piece_type == chess.PAWN:
            return False
    return True


def _analyze_game(game: chess.pgn.Game, target_color: chess.Color, accum: _Accum) -> None:
    board = game.board()
    minor_developed: set[chess.Square] = set()
    minor_start = WHITE_MINOR_START if target_color == chess.WHITE else BLACK_MINOR_START
    dev_recorded = False
    ply = 0

    for node in game.mainline():
        move = node.move
        piece = board.piece_at(move.from_square)
        if piece is None:
            board.push(move)
            ply += 1
            continue

        is_target = piece.color == target_color

        if is_target:
            accum.total_moves += 1
            full_move = (ply // 2) + 1

            # Development: record the move number when the 2nd minor piece leaves its
            # starting square. Using 2 (not 4) avoids false "never developed" readings
            # in games where a bishop stays home for positional reasons (e.g. Ruy Lopez).
            if piece.piece_type in (chess.KNIGHT, chess.BISHOP):
                if move.from_square in minor_start:
                    minor_developed.add(move.from_square)
                    if len(minor_developed) == 2 and not dev_recorded:
                        accum.dev_moves.append(full_move)
                        dev_recorded = True

            # Tactical intensity: count moves that give check.
            # Check frequency is the cleanest computable proxy for attacking/sacrificial
            # style — it separates Morphy (~10%) from Kasparov (~5%) without needing
            # engine evaluation to distinguish voluntary vs. forced material exchanges.
            if board.gives_check(move):
                accum.checks += 1

            # King attack: landing within a 5×5 zone around opponent's king
            opp_king = board.king(not target_color)
            if opp_king is not None:
                df = abs(chess.square_file(move.to_square) - chess.square_file(opp_king))
                dr = abs(chess.square_rank(move.to_square) - chess.square_rank(opp_king))
                if df <= 2 and dr <= 2:
                    accum.king_attack += 1

            # Rook on open file
            if piece.piece_type == chess.ROOK:
                accum.rook_moves += 1
                if _is_open_file(board, chess.square_file(move.to_square)):
                    accum.rook_open_file += 1

            # Pawn advances past 5th rank
            if piece.piece_type == chess.PAWN:
                to_rank = chess.square_rank(move.to_square)
                if target_color == chess.WHITE and to_rank >= 4:
                    accum.pawn_advances += 1
                elif target_color == chess.BLACK and to_rank <= 3:
                    accum.pawn_advances += 1

            # Pieces landing in enemy half
            to_rank = chess.square_rank(move.to_square)
            if target_color == chess.WHITE and to_rank >= 4:
                accum.enemy_half_moves += 1
            elif target_color == chess.BLACK and to_rank <= 3:
                accum.enemy_half_moves += 1

        board.push(move)
        ply += 1

    accum.game_lengths.append(ply // 2)

    # Endgame tendency: did this game get played down into an endgame, or was it
    # decided while the board was still full? Separates grinders (Carlsen) from
    # players who finish it in the middlegame (Morphy, Tal).
    accum.finished_games += 1
    final_material = _material(board)
    accum.final_materials.append(final_material)
    if final_material <= ENDGAME_MATERIAL:
        accum.endgame_games += 1


def _normalize(raw: float, lo: float, hi: float) -> float:
    """Map raw value linearly from [lo, hi] → [0, 100], clamped."""
    if hi == lo:
        return 50.0
    return max(0.0, min(100.0, (raw - lo) / (hi - lo) * 100))


def compute_style(pgn_text: str, player_name: str | list[str]) -> dict:
    """
    Parse pgn_text and compute style axes for player_name.
    player_name (or any name in a list) is matched against White/Black PGN headers
    (case-insensitive substring). Returns a dict with axes + human-readable stats,
    or empty dict if no matching games found.
    """
    names = [player_name] if isinstance(player_name, str) else player_name
    names_lower = [n.lower() for n in names]

    accum = _Accum()
    pgn_io = io.StringIO(pgn_text)
    games_processed = 0

    while True:
        game = chess.pgn.read_game(pgn_io)
        if game is None:
            break

        white = game.headers.get("White", "").lower()
        black = game.headers.get("Black", "").lower()

        if any(n in white for n in names_lower):
            target_color = chess.WHITE
        elif any(n in black for n in names_lower):
            target_color = chess.BLACK
        else:
            continue

        try:
            _analyze_game(game, target_color, accum)
            games_processed += 1
        except Exception:
            continue

        # Decisiveness is a property of the game, not of who won it.
        result = game.headers.get("Result", "*")
        if result in ("1-0", "0-1"):
            accum.decisive_games += 1
            accum.decided_games += 1
        elif result == "1/2-1/2":
            accum.decided_games += 1

    if games_processed == 0 or accum.total_moves == 0:
        return {}

    # Raw rates
    avg_dev_move   = sum(accum.dev_moves) / len(accum.dev_moves) if accum.dev_moves else 10.0
    check_rate     = accum.checks / accum.total_moves
    king_atk_rate  = accum.king_attack / accum.total_moves
    open_file_rate = accum.rook_open_file / max(accum.rook_moves, 1)
    pawn_adv_rate  = accum.pawn_advances / accum.total_moves
    avg_game_len   = sum(accum.game_lengths) / len(accum.game_lengths)
    decisive_rate  = accum.decisive_games / max(accum.decided_games, 1)
    endgame_rate   = accum.endgame_games / max(accum.finished_games, 1)
    avg_final_mat  = sum(accum.final_materials) / len(accum.final_materials) if accum.final_materials else STARTING_MATERIAL
    material_traded = STARTING_MATERIAL - avg_final_mat  # higher = simplifies more

    # Normalize to 0–100. Windows are fitted to the spread measured across the GM
    # corpora (full corpus, not sampled) so the five grandmasters spread out
    # rather than clustering. Reference values (raw):
    #   decisiveness   decisive%:  Morphy 92, Carlsen/Fischer 69, Kasparov 59, Tal 52
    #   endgame        endgame%:   Carlsen 40, Fischer 32, Kasparov 25, Tal 21, Morphy 20
    #   patience       avg length: Carlsen 46, Fischer 40, Kasparov 38, Tal 35, Morphy 32
    #   simplification 78−final:   Carlsen 50.6, Fischer 46.9, Kasparov 42.8, Morphy/Tal 40
    #   attack         check%:     Morphy 10.8, Carlsen 5.8, Fischer 5.4, Kasparov 4.8, Tal 4.5
    dec_score   = _normalize(decisive_rate * 100, lo=48, hi=92)
    endg_score  = _normalize(endgame_rate * 100, lo=18, hi=42)
    patience    = _normalize(avg_game_len, lo=31, hi=47)
    simplify    = _normalize(material_traded, lo=40, hi=51)
    attack      = _normalize(check_rate * 100, lo=4.0, hi=11.0)

    return {
        "decisiveness":     round(dec_score, 1),
        "endgame_tendency": round(endg_score, 1),
        "patience":         round(patience, 1),
        "simplification":   round(simplify, 1),
        "attack":           round(attack, 1),
        "games_analyzed": games_processed,
        "avg_game_length": round(avg_game_len, 1),
        # Human-readable for the head-to-head comparison table. Development speed,
        # open-file rate and king-attack rate stay here as stats even though they
        # are no longer axes (they measure competence, not style).
        "check_rate_pct":      f"{check_rate * 100:.1f}%",
        "open_file_pct":       f"{open_file_rate * 100:.0f}%",
        "king_attack_pct":     f"{king_atk_rate * 100:.0f}%",
        "development_speed":   f"move {avg_dev_move:.1f}",
        "decisive_pct":        f"{decisive_rate * 100:.0f}%",
        "endgame_pct":         f"{endgame_rate * 100:.0f}%",
        "avg_final_material":  round(avg_final_mat, 1),
    }

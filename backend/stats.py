"""Aggregations for profile, openings, and time-control filtering."""

from __future__ import annotations

import io

import chess.pgn
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models import Game, GmProfile, Position, WeaknessProfile


def parse_time_control_base(time_control: str | None) -> int | None:
    if not time_control:
        return None
    base = time_control.split("+")[0].strip()
    if not base.isdigit():
        return None
    return int(base)


def classify_time_control(time_control: str | None) -> str:
    """Map Chess.com TimeControl strings to bullet / blitz / rapid / classical."""
    base = parse_time_control_base(time_control)
    if base is None:
        return "other"
    if base < 180:
        return "bullet"
    if base < 600:
        return "blitz"
    if base < 1800:
        return "rapid"
    return "classical"


def games_query(db: Session, username: str, analyzed_only: bool = True):
    query = db.query(Game).filter_by(username=username.lower())
    if analyzed_only:
        query = query.filter_by(analyzed=True)
    return query


def filter_games_by_tc(games: list[Game], tc: str | None) -> list[Game]:
    if not tc or tc == "all":
        return games
    return [game for game in games if classify_time_control(game.time_control) == tc]


def extract_opening_moves(pgn: str | None, max_ply: int = 6) -> str:
    """First few moves in SAN notation, e.g. 1.e4 e5 2.Nf3 Nc6."""
    if not pgn:
        return ""
    try:
        game = chess.pgn.read_game(io.StringIO(pgn))
        if not game:
            return ""
        san_moves: list[str] = []
        node = game
        while node.variations and len(san_moves) < max_ply:
            node = node.variations[0]
            san_moves.append(node.san())
        parts: list[str] = []
        for index, san in enumerate(san_moves):
            if index % 2 == 0:
                parts.append(f"{index // 2 + 1}.{san}")
            else:
                parts[-1] += f" {san}"
        return " ".join(parts)
    except Exception:
        return ""


def game_url(game_id: str) -> str:
    return f"https://www.chess.com/game/live/{game_id}"


def _avg_cp_loss(db: Session, game_id: str) -> float | None:
    rows = (
        db.query(Position.centipawn_loss)
        .filter_by(game_id=game_id, is_your_move=True)
        .filter(Position.centipawn_loss.isnot(None))
        .all()
    )
    if not rows:
        return None
    return sum(row[0] for row in rows) / len(rows)


def _example_game_for_opening(db: Session, game_ids: list[str]) -> dict | None:
    """Pick the game with the largest single-move centipawn loss in this opening."""
    if not game_ids:
        return None
    row = (
        db.query(Position.game_id, Position.move_number, Position.centipawn_loss)
        .filter(
            Position.game_id.in_(game_ids),
            Position.is_your_move.is_(True),
            Position.centipawn_loss.isnot(None),
        )
        .order_by(Position.centipawn_loss.desc())
        .first()
    )
    if not row:
        game_id = game_ids[0]
        return {"game_id": game_id, "move_number": None, "url": game_url(game_id)}
    return {
        "game_id": row.game_id,
        "move_number": row.move_number,
        "url": game_url(row.game_id),
    }


def aggregate_openings(username: str, db: Session, tc: str | None = None) -> dict:
    games = filter_games_by_tc(games_query(db, username).all(), tc)
    buckets: dict[tuple[str, str], dict] = {}

    for game in games:
        color = game.player_color or "white"
        key = (color, game.eco or "?", game.opening_name or "Unknown")
        if key not in buckets:
            buckets[key] = {
                "eco": game.eco or "?",
                "name": game.opening_name or "Unknown",
                "games": 0,
                "wins": 0,
                "draws": 0,
                "losses": 0,
                "cp_losses": [],
                "game_ids": [],
                "moves_notation": "",
            }
        bucket = buckets[key]
        bucket["games"] += 1
        bucket["game_ids"].append(game.id)
        if game.result == "win":
            bucket["wins"] += 1
        elif game.result == "draw":
            bucket["draws"] += 1
        else:
            bucket["losses"] += 1
        avg_cp = _avg_cp_loss(db, game.id)
        if avg_cp is not None:
            bucket["cp_losses"].append(avg_cp)
        if not bucket["moves_notation"] and game.raw_pgn:
            bucket["moves_notation"] = extract_opening_moves(game.raw_pgn)

    def serialize(color: str) -> list[dict]:
        rows = []
        for (row_color, _eco, _name), data in buckets.items():
            if row_color != color:
                continue
            total = data["games"] or 1
            avg_cp = round(sum(data["cp_losses"]) / len(data["cp_losses"])) if data["cp_losses"] else 0
            example = _example_game_for_opening(db, data["game_ids"])
            rows.append(
                {
                    "eco": data["eco"],
                    "name": data["name"],
                    "moves_notation": data["moves_notation"],
                    "games": data["games"],
                    "win_rate": round(data["wins"] / total * 100),
                    "draw_rate": round(data["draws"] / total * 100),
                    "loss_rate": round(data["losses"] / total * 100),
                    "avg_accuracy": avg_cp,
                    "example_game": example,
                }
            )
        rows.sort(key=lambda row: row["games"], reverse=True)
        return rows

    return {"white": serialize("white"), "black": serialize("black")}


def get_blunder_examples(username: str, db: Session, limit_per_theme: int = 3) -> list[dict]:
    """Return up to limit_per_theme example blunder positions per tactical theme."""
    positions = (
        db.query(Position)
        .join(Game)
        .filter(
            Game.username == username.lower(),
            Position.is_your_move.is_(True),
            Position.classification == "blunder",
            Position.tactical_motif.isnot(None),
            Position.fen.isnot(None),
        )
        .order_by(Position.centipawn_loss.desc())
        .all()
    )

    seen: dict[str, int] = {}
    results = []
    for pos in positions:
        theme = pos.tactical_motif
        count = seen.get(theme, 0)
        if count >= limit_per_theme:
            continue
        seen[theme] = count + 1
        results.append(
            {
                "theme": theme,
                "fen": pos.fen,
                "move_played": pos.move_played,
                "best_move": pos.best_move,
                "centipawn_loss": round(pos.centipawn_loss) if pos.centipawn_loss else 0,
                "game_id": pos.game_id,
                "move_number": pos.move_number,
            }
        )
    return results


def build_profile(username: str, db: Session, tc: str | None = None) -> dict:
    username = username.lower()
    all_analyzed = games_query(db, username).all()
    filtered = filter_games_by_tc(all_analyzed, tc)
    filtered_ids = [game.id for game in filtered]

    profiles = (
        db.query(WeaknessProfile)
        .filter_by(username=username)
        .order_by(WeaknessProfile.severity.desc())
        .all()
    )

    if tc and tc != "all" and filtered_ids:
        theme_stats: dict[str, dict] = {}
        positions = (
            db.query(Position)
            .filter(
                Position.game_id.in_(filtered_ids),
                Position.is_your_move.is_(True),
                Position.tactical_motif.isnot(None),
            )
            .all()
        )
        for position in positions:
            theme = position.tactical_motif or "positional"
            if theme not in theme_stats:
                theme_stats[theme] = {"frequency": 0, "cp_losses": [], "last_seen": None}
            theme_stats[theme]["frequency"] += 1
            if position.centipawn_loss is not None:
                theme_stats[theme]["cp_losses"].append(position.centipawn_loss)
        profile_rows = []
        for theme, data in sorted(
            theme_stats.items(),
            key=lambda item: sum(item[1]["cp_losses"]) / max(len(item[1]["cp_losses"]), 1),
            reverse=True,
        ):
            severity = sum(data["cp_losses"]) / len(data["cp_losses"]) if data["cp_losses"] else 0
            profile_rows.append(
                {
                    "theme": theme,
                    "frequency": data["frequency"],
                    "severity": severity,
                    "last_seen": None,
                    "updated_at": None,
                }
            )
    else:
        profile_rows = [
            {
                "theme": profile.theme,
                "frequency": profile.frequency,
                "severity": profile.severity,
                "last_seen": profile.last_seen.isoformat() if profile.last_seen else None,
                "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
            }
            for profile in profiles
        ]

    blunder_q = (
        db.query(func.count(Position.id))
        .join(Game)
        .filter(
            Game.username == username,
            Position.is_your_move.is_(True),
            Position.classification == "blunder",
        )
    )
    if tc and tc != "all" and filtered_ids:
        blunder_q = blunder_q.filter(Position.game_id.in_(filtered_ids))
    blunders = blunder_q.scalar() or 0

    games_analyzed = len(filtered)
    played_dates = [game.played_at for game in filtered if game.played_at]
    earliest = min(played_dates) if played_dates else None
    latest = max(played_dates) if played_dates else None

    tc_counts: dict[str, int] = {"bullet": 0, "blitz": 0, "rapid": 0, "classical": 0, "other": 0}
    for game in all_analyzed:
        tc_counts[classify_time_control(game.time_control)] += 1

    return {
        "profile": profile_rows,
        "stats": {
            "games_analyzed": games_analyzed,
            "blunder_rate": round(blunders / games_analyzed, 2) if games_analyzed else 0,
            "total_blunders": blunders,
        },
        "meta": {
            "time_control": tc or "all",
            "earliest_game": earliest.isoformat() if earliest else None,
            "latest_game": latest.isoformat() if latest else None,
            "time_controls": tc_counts,
        },
    }


def list_gm_profiles(db: Session) -> list[dict]:
    profiles = db.query(GmProfile).order_by(GmProfile.birth_year).all()
    return [
        {
            "slug":         p.slug,
            "display_name": p.display_name,
            "birth_year":   p.birth_year,
            "games_analyzed": p.games_analyzed,
        }
        for p in profiles
    ]


def compute_user_style(username: str, db: Session) -> dict:
    """
    Compute the same 5 style axes for a user from their stored PGNs.
    Uses the same logic as gm/compute_style.py but reads from the DB.
    """
    from gm.compute_style import compute_style

    games = (
        db.query(Game)
        .filter_by(username=username.lower(), analyzed=True)
        .filter(Game.raw_pgn.isnot(None))
        .all()
    )
    if not games:
        return {}

    # Build a combined PGN where the username always appears as the correct color.
    # For each game, overwrite the White/Black header so the compute function can find them.
    pgn_parts: list[str] = []
    for game in games:
        if not game.raw_pgn:
            continue
        pgn = game.raw_pgn
        # Replace player color header so the matcher finds username in PGN headers
        if game.player_color == "white":
            pgn = pgn.replace('[White "', f'[White "{username}\n[_OrigWhite "', 1)
        else:
            pgn = pgn.replace('[Black "', f'[Black "{username}\n[_OrigBlack "', 1)
        pgn_parts.append(pgn)

    combined = "\n\n".join(pgn_parts)
    return compute_style(combined, username)


def get_style_gap(username: str, gm_slug: str, db: Session) -> dict | None:
    gm = db.query(GmProfile).filter_by(slug=gm_slug).first()
    if not gm:
        return None

    user_style = compute_user_style(username, db)

    gm_axes = {
        "development":    gm.development,
        "open_files":     gm.open_files,
        "king_attack":    gm.king_attack,
        "sacrifice_rate": gm.sacrifice_rate,
        "aggression":     gm.aggression,
    }
    gm_stats = {
        "avg_game_length":   gm.avg_game_length,
        "sacrifice_rate":    gm.sacrifice_rate_pct or f"{gm.sacrifice_rate:.0f}%",
        "open_file_control": gm.open_file_pct or f"{gm.open_files:.0f}%",
        "king_attack_freq":  gm.king_attack_pct or f"{gm.king_attack:.0f}%",
        "development_speed": gm.development_speed or "—",
    }

    you_axes = {
        "development":    user_style.get("development", 0),
        "open_files":     user_style.get("open_files", 0),
        "king_attack":    user_style.get("king_attack", 0),
        "sacrifice_rate": user_style.get("sacrifice_rate", 0),
        "aggression":     user_style.get("aggression", 0),
    }
    you_stats = {
        "avg_game_length":   user_style.get("avg_game_length", "—"),
        "sacrifice_rate":    user_style.get("sacrifice_rate_pct", "—"),
        "open_file_control": user_style.get("open_file_pct", "—"),
        "king_attack_freq":  user_style.get("king_attack_pct", "—"),
        "development_speed": user_style.get("development_speed", "—"),
    }

    return {
        "you":   you_axes,
        "gm":    gm_axes,
        "gm_meta": {"slug": gm.slug, "name": gm.display_name, "games_analyzed": gm.games_analyzed},
        "stats": {"you": you_stats, gm.slug: gm_stats},
        # Legacy field for stylegap.jsx compatibility
        "morphy": gm_axes,
    }

from datetime import datetime, timezone
from typing import Callable

from sqlalchemy.orm import Session

from db.models import Game, Position
from ingestion.chess_com import fetch_all_games
from ingestion.pgn_parser import parse_pgn


def _map_result(parsed) -> str:
    if parsed.result == "1/2-1/2":
        return "draw"
    if parsed.player_color == "white":
        return "win" if parsed.result == "1-0" else "loss"
    return "win" if parsed.result == "0-1" else "loss"


async def ingest_user_games(
    username: str,
    db: Session,
    on_progress: Callable[[int], None] | None = None,
) -> list[str]:
    ingested_ids: list[str] = []

    async for raw_game in fetch_all_games(username):
        pgn = raw_game.get("pgn", "")
        if not pgn:
            continue

        parsed = parse_pgn(pgn, username)
        if db.query(Game).filter_by(id=parsed.game_id).first():
            continue

        played_at = None
        if end_time := raw_game.get("end_time"):
            played_at = datetime.fromtimestamp(end_time, tz=timezone.utc)

        game = Game(
            id=parsed.game_id,
            username=username.lower(),
            player_color=parsed.player_color,
            result=_map_result(parsed),
            time_control=parsed.time_control,
            eco=parsed.eco,
            opening_name=parsed.opening_name,
            played_at=played_at,
            raw_pgn=pgn,
            analyzed=False,
        )
        db.add(game)

        for pos in parsed.positions:
            is_your_move = pos["is_white_turn"] == (parsed.player_color == "white")
            db.add(
                Position(
                    game_id=parsed.game_id,
                    fen=pos["fen"],
                    move_number=pos["move_number"],
                    move_played=pos["move_played"],
                    clock_remaining=pos.get("clock_remaining"),
                    is_your_move=is_your_move,
                )
            )

        ingested_ids.append(parsed.game_id)
        db.commit()
        if on_progress:
            on_progress(len(ingested_ids))

    return ingested_ids

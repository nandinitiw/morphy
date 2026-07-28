from sqlalchemy.orm import Session

from analysis.classifier import classify_tactical_motif
from analysis.stockfish_worker import (
    analyze_game_batch_with_engine,
    load_fen_cache_from_db,
    stockfish_pool,
)
from db.models import Game, Position


def _apply_analysis_results(positions: list[Position], results: list[dict]) -> None:
    for position, result in zip(positions, results):
        if not position.is_your_move or result["classification"] is None:
            continue

        position.best_move = result["best_move"]
        position.centipawn_loss = result["centipawn_loss"]
        position.classification = result["classification"]

        if result["classification"] == "blunder" and result["best_move"]:
            position.tactical_motif = classify_tactical_motif(
                position.fen,
                position.move_played,
                result["best_move"],
            )


async def process_game(game_id: str, db: Session, fen_cache: dict, engine) -> bool:
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game or game.analyzed:
        return False

    positions = (
        db.query(Position)
        .filter_by(game_id=game_id)
        .order_by(Position.move_number)
        .all()
    )
    position_dicts = [
        {"fen": p.fen, "move_played": p.move_played, "analyze": p.is_your_move}
        for p in positions
    ]
    results = await analyze_game_batch_with_engine(engine, position_dicts, fen_cache)
    _apply_analysis_results(positions, results)

    game.analyzed = True
    db.commit()
    return True


async def analyze_user_games(username: str, db: Session) -> int:
    games = db.query(Game).filter_by(username=username, analyzed=False).all()
    if not games:
        return 0

    fen_cache = load_fen_cache_from_db(db)
    engine = await stockfish_pool.get_engine()
    analyzed = 0

    for game in games:
        if await process_game(game.id, db, fen_cache, engine):
            analyzed += 1

    return analyzed

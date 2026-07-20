import asyncio
import os
import shutil
from pathlib import Path

import chess
import chess.engine
from sqlalchemy.orm import Session

from db.models import Position

ANALYSIS_DEPTH = int(os.getenv("ANALYSIS_DEPTH", "15"))

# Cap centipawn loss at 10 pawns. Positions involving a forced mate are scored at
# ±10000 (mate_score below), so a missed/allowed mate would otherwise register as
# thousands of "centipawns lost" and inflate a theme's severity to nonsensical
# values (e.g. 6000+). Beyond ~1000cp the practical meaning is identical —
# "decisive blunder" — so we clamp to keep severity numbers believable.
MAX_CENTIPAWN_LOSS = 1000

SKIPPED_RESULT = {"best_move": None, "centipawn_loss": None, "classification": None}

COMMON_STOCKFISH_PATHS = (
    "/usr/games/stockfish",       # Debian/Ubuntu apt (Render Docker)
    "/usr/bin/stockfish",         # some Linux distros
    "/opt/homebrew/bin/stockfish",
    "/usr/local/bin/stockfish",
)


def resolve_stockfish_path() -> str:
    configured = os.getenv("STOCKFISH_PATH")
    if configured and Path(configured).is_file():
        return configured

    found = shutil.which("stockfish")
    if found:
        return found

    for path in COMMON_STOCKFISH_PATHS:
        if Path(path).is_file():
            return path

    hint = f"STOCKFISH_PATH={configured!r} was set but not found. " if configured else ""
    raise FileNotFoundError(
        f"{hint}Stockfish binary not found. Install it with `brew install stockfish` "
        "or `apt-get install stockfish`, or set STOCKFISH_PATH to the binary location."
    )


class StockfishPool:
    def __init__(self):
        self._engine = None
        self._lock = asyncio.Lock()
        self._stockfish_path: str | None = None

    def _path(self) -> str:
        if self._stockfish_path is None:
            self._stockfish_path = resolve_stockfish_path()
        return self._stockfish_path

    async def get_engine(self):
        async with self._lock:
            if self._engine is None:
                _, self._engine = await chess.engine.popen_uci(self._path())
            return self._engine

    async def close(self):
        async with self._lock:
            if self._engine is not None:
                await self._engine.quit()
                self._engine = None


stockfish_pool = StockfishPool()


def load_fen_cache_from_db(db: Session) -> dict:
    # Query bare columns, not ORM objects — this table grows with every
    # analyzed game and full entities would pin the whole corpus in memory.
    rows = (
        db.query(
            Position.fen,
            Position.move_played,
            Position.best_move,
            Position.centipawn_loss,
            Position.classification,
        )
        .filter(Position.best_move.isnot(None))
        .all()
    )
    return {
        f"{fen}|{move_played}": {
            "best_move": best_move,
            "centipawn_loss": centipawn_loss,
            "classification": classification,
        }
        for fen, move_played, best_move, centipawn_loss, classification in rows
    }


async def analyze_position(engine: chess.engine.UciProtocol, fen: str, move_played: str) -> dict:
    board = chess.Board(fen)

    result = await engine.analyse(board, chess.engine.Limit(depth=ANALYSIS_DEPTH))
    best_move = result.get("pv", [None])[0]
    score = result["score"].relative

    board_after_played = chess.Board(fen)
    board_after_played.push(chess.Move.from_uci(move_played))
    result_after = await engine.analyse(board_after_played, chess.engine.Limit(depth=ANALYSIS_DEPTH))

    score_after = -result_after["score"].relative
    best_cp = score.score(mate_score=10000) or 0
    played_cp = score_after.score(mate_score=10000) or 0
    centipawn_loss = min(max(0, best_cp - played_cp), MAX_CENTIPAWN_LOSS)

    return {
        "best_move": best_move.uci() if best_move else None,
        "centipawn_loss": centipawn_loss,
        "classification": classify_move(centipawn_loss),
    }


def classify_move(cp_loss: float) -> str:
    if cp_loss < 10:
        return "best"
    if cp_loss < 25:
        return "good"
    if cp_loss < 50:
        return "inaccuracy"
    if cp_loss < 150:
        return "mistake"
    return "blunder"


async def analyze_game_batch_with_engine(
    engine: chess.engine.UciProtocol,
    game_positions: list[dict],
    fen_cache: dict,
) -> list[dict]:
    results = []
    for pos in game_positions:
        if not pos.get("analyze", True):
            results.append(SKIPPED_RESULT.copy())
            continue

        cache_key = f"{pos['fen']}|{pos['move_played']}"
        if cache_key in fen_cache:
            results.append(fen_cache[cache_key])
            continue

        analysis = await analyze_position(engine, pos["fen"], pos["move_played"])
        fen_cache[cache_key] = analysis
        results.append(analysis)

    return results


async def analyze_game_batch(game_positions: list[dict], fen_cache: dict) -> list[dict]:
    engine = await stockfish_pool.get_engine()
    return await analyze_game_batch_with_engine(engine, game_positions, fen_cache)

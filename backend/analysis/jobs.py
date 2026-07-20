import os
import uuid
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from analysis.pipeline import process_game
from analysis.stockfish_worker import load_fen_cache_from_db, stockfish_pool
from db.database import SessionLocal
from db.models import Game, IngestJob
from ingestion.pipeline import ingest_user_games
from profiler.clusterer import refresh_weakness_profile

logger = logging.getLogger(__name__)

# On the free Render tier, Stockfish runs at ~1 min/game and the instance can be
# restarted (OOM under 512 MB, or health-check timeout under 0.1 CPU) before a
# full ~60-game run finishes — taking the ephemeral SQLite job + games with it.
# Cap the expensive analysis to the most-recent N games so a run completes well
# inside that window. 0 (the default) means "analyze everything" — set the env
# on constrained hosts (see render.yaml). Ingestion itself is uncapped; only the
# Stockfish loop is bounded, so stats/openings still see the full history.
MAX_ANALYZE_GAMES = int(os.getenv("MAX_ANALYZE_GAMES", "0"))


ACTIVE_STATUSES = ("pending", "ingesting", "analyzing", "profiling")


def get_active_job(username: str, db: Session) -> IngestJob | None:
    """Return a still-running job for this user, if any."""
    return (
        db.query(IngestJob)
        .filter(IngestJob.username == username, IngestJob.status.in_(ACTIVE_STATUSES))
        .order_by(IngestJob.created_at.desc())
        .first()
    )


def create_ingest_job(username: str, db: Session) -> IngestJob:
    job = IngestJob(
        id=str(uuid.uuid4()),
        username=username,
        status="pending",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_ingest_job(job_id: str, db: Session) -> IngestJob | None:
    return db.query(IngestJob).filter_by(id=job_id).first()


def serialize_job(job: IngestJob) -> dict:
    return {
        "job_id": job.id,
        "username": job.username,
        "status": job.status,
        "games_ingested": job.games_ingested,
        "games_analyzed": job.games_analyzed,
        "games_total": job.games_total,
        "weakness_themes": job.weakness_themes,
        "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
    }


def _update_job(db: Session, job: IngestJob, **fields) -> None:
    for key, value in fields.items():
        setattr(job, key, value)
    job.updated_at = datetime.now()
    db.commit()


async def run_ingest_job(job_id: str) -> None:
    db = SessionLocal()
    try:
        job = db.query(IngestJob).filter_by(id=job_id).first()
        if not job:
            logger.warning("Ingest job %s not found", job_id)
            return

        logger.info("Starting ingest job %s for %s", job_id, job.username)
        _update_job(db, job, status="ingesting")

        def report_ingest_progress(count: int) -> None:
            _update_job(db, job, games_ingested=count)

        ingested_ids = await ingest_user_games(
            job.username,
            db,
            on_progress=report_ingest_progress,
        )
        logger.info("Job %s ingested %d games", job_id, len(ingested_ids))
        _update_job(db, job, games_ingested=len(ingested_ids))

        unanalyzed = (
            db.query(Game)
            .filter_by(username=job.username, analyzed=False)
            .order_by(Game.played_at.desc())
            .all()
        )
        game_ids = [game.id for game in unanalyzed]

        # Bound the Stockfish loop to the most-recent N games on constrained hosts.
        if MAX_ANALYZE_GAMES and len(game_ids) > MAX_ANALYZE_GAMES:
            logger.info(
                "Job %s: capping analysis to %d of %d unanalyzed games (MAX_ANALYZE_GAMES)",
                job_id, MAX_ANALYZE_GAMES, len(game_ids),
            )
            game_ids = game_ids[:MAX_ANALYZE_GAMES]

        _update_job(
            db,
            job,
            status="analyzing",
            games_total=len(game_ids),
            games_analyzed=0,
        )

        fen_cache = load_fen_cache_from_db(db)
        engine = await stockfish_pool.get_engine()
        analyzed = 0
        failed_games = 0

        for game_id in game_ids:
            try:
                if await process_game(game_id, db, fen_cache, engine):
                    analyzed += 1
                    _update_job(db, job, games_analyzed=analyzed)
            except Exception:
                # One corrupt game must not kill the batch
                logger.exception("Job %s: game %s failed analysis, skipping", job_id, game_id)
                db.rollback()
                failed_games += 1

        if failed_games:
            logger.warning("Job %s: %d of %d games failed analysis", job_id, failed_games, len(game_ids))

        _update_job(db, job, status="profiling")
        profiles = refresh_weakness_profile(job.username, db)
        _update_job(
            db,
            job,
            status="completed",
            weakness_themes=len(profiles),
        )
        logger.info("Job %s completed", job_id)
    except Exception as exc:
        logger.exception("Ingest job %s failed", job_id)
        db.rollback()
        job = db.query(IngestJob).filter_by(id=job_id).first()
        if job:
            _update_job(db, job, status="failed", error=str(exc))
    finally:
        db.close()

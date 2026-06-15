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

        for game_id in game_ids:
            if await process_game(game_id, db, fen_cache, engine):
                analyzed += 1
                _update_job(db, job, games_analyzed=analyzed)

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

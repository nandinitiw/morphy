import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session

from analysis.pipeline import analyze_user_games
from db.database import SessionLocal
from db.models import Game
from ingestion.pipeline import ingest_user_games
from profiler.clusterer import refresh_weakness_profile

scheduler = AsyncIOScheduler()


def get_tracked_usernames(db: Session | None = None) -> list[str]:
    """Return usernames to refresh nightly."""

    env_usernames = os.getenv("TRACKED_USERNAMES", "").strip()
    if env_usernames:
        return [name.strip() for name in env_usernames.split(",") if name.strip()]

    owns_session = db is None
    db = db or SessionLocal()
    try:
        rows = db.query(Game.username).distinct().all()
        return [row[0] for row in rows]
    finally:
        if owns_session:
            db.close()


@scheduler.scheduled_job("cron", hour=2)  # Run at 2am every night
async def nightly_update():
    """
    For each tracked user:
    1. Fetch new games from Chess.com
    2. Run Stockfish analysis on any unanalyzed games
    3. Re-cluster weakness profile
    """

    db = SessionLocal()
    try:
        usernames = get_tracked_usernames(db)
    finally:
        db.close()

    for username in usernames:
        db = SessionLocal()
        try:
            ingested_ids = await ingest_user_games(username, db)
            analyzed = await analyze_user_games(username, db)

            if ingested_ids or analyzed:
                profiles = refresh_weakness_profile(username, db)
                print(
                    f"[{username}] Ingested {len(ingested_ids)} games, "
                    f"analyzed {analyzed}, updated {len(profiles)} weakness themes"
                )
        except Exception as exc:
            db.rollback()
            print(f"[{username}] Nightly update failed: {exc}")
        finally:
            db.close()


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown()

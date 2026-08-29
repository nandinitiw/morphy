import logging
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import Base

logger = logging.getLogger(__name__)

def normalize_database_url(url: str) -> str:
    """Render and Heroku hand out postgres:// URLs, but SQLAlchemy 2 removed that
    alias and raises NoSuchModuleError on it. Rewrite to the postgresql:// scheme
    so attaching a managed Postgres instance works without editing the URL by hand.
    """
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


DATABASE_URL = normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./morphy.db"))
_is_sqlite = DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Managed Postgres (e.g. Render) silently drops idle connections, which
    # otherwise surfaces as "server closed the connection unexpectedly" on the
    # next query after the app has been quiet. pool_pre_ping checks liveness
    # before handing out a connection, and pool_recycle proactively retires
    # connections older than the provider's idle timeout.
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

# Falling back to SQLite is silent and looks identical to a working Postgres
# from the outside — until a restart wipes the container and every user's data
# with it. Say plainly which backend is live so a missing DATABASE_URL is
# obvious in the logs instead of being discovered the hard way.
if _is_sqlite:
    logger.warning(
        "DATABASE_URL not set — using EPHEMERAL SQLite at %s. "
        "Data will be lost on restart. Set DATABASE_URL to a managed Postgres "
        "for durable storage.",
        DATABASE_URL,
    )
else:
    logger.info("Using durable database backend: %s", engine.dialect.name)


def database_backend() -> dict:
    """Non-sensitive description of the live database. Never exposes credentials."""
    return {
        "dialect": engine.dialect.name,
        "configured": os.getenv("DATABASE_URL") is not None,
        "durable": not _is_sqlite,
    }


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

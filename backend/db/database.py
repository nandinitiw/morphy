import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import Base

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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

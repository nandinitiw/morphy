import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from agent.coach_agent import run_coach_session
from analysis.jobs import create_ingest_job, get_ingest_job, run_ingest_job, serialize_job
from analysis.stockfish_worker import stockfish_pool
from db.database import get_db
from demo.seed_demo import seed as seed_demo
from gm.seed_gms import GM_REGISTRY, seed_gm
from stats import aggregate_openings, build_profile, get_blunder_examples, get_style_gap, list_gm_profiles

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed demo user and GM profiles on first startup (idempotent)
    try:
        seed_demo(reset=False)
    except Exception as exc:
        logger.warning("Demo seed skipped: %s", exc)
    try:
        from db.database import get_db as _get_db
        db = next(_get_db())
        for gm in GM_REGISTRY:
            seed_gm(gm, db)
        db.close()
    except Exception as exc:
        logger.warning("GM seed skipped: %s", exc)
    yield
    await stockfish_pool.close()


app = FastAPI(lifespan=lifespan)

_default_origins = "http://localhost:5173,http://localhost:5174"
_cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", _default_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app"),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CoachRequest(BaseModel):
    username: str
    message: str
    history: list[dict] | None = None


@app.get("/")
async def root():
    return {
        "name": "Morphy API",
        "status": "ok",
        "docs": "/docs",
        "endpoints": {
            "coach": "POST /coach",
            "ingest": "POST /ingest/{username}",
            "job_status": "GET /jobs/{job_id}",
            "profile": "GET /profile/{username}",
            "openings": "GET /openings/{username}",
        },
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/coach")
async def coach(req: CoachRequest, db: Session = Depends(get_db)):
    response = await run_coach_session(req.username, req.message, db, history=req.history)
    return {"response": response}


@app.post("/ingest/{username}")
async def ingest(
    username: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Enqueue a background ingestion + analysis job for a user."""
    job = create_ingest_job(username, db)
    background_tasks.add_task(run_ingest_job, job.id)
    logger.info("Queued ingest job %s for %s", job.id, username)
    return serialize_job(job)


@app.get("/jobs/{job_id}")
async def job_status(job_id: str, db: Session = Depends(get_db)):
    job = get_ingest_job(job_id, db)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize_job(job)


@app.get("/profile/{username}")
async def get_profile(
    username: str,
    tc: str | None = Query(default=None, description="bullet, blitz, rapid, classical, or all"),
    db: Session = Depends(get_db),
):
    """Return weakness profile + summary stats for the dashboard."""
    return build_profile(username, db, tc)


@app.get("/gms")
async def list_gms(db: Session = Depends(get_db)):
    """Return all seeded GM profiles available for style comparison."""
    return {"gms": list_gm_profiles(db)}


@app.post("/demo/seed")
async def seed_demo_data(reset: bool = Query(default=False)):
    """
    Seed (or re-seed) the demo user with pre-baked game + blunder data.
    Safe to call multiple times; use ?reset=true to wipe and start fresh.
    """
    try:
        seed_demo(reset=reset)
        return {"status": "ok", "message": "Demo data seeded successfully."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/style-gap/{username}")
async def style_gap(
    username: str,
    gm: str = Query(default="morphy", description="GM slug (morphy, tal, fischer, kasparov, carlsen)"),
    db: Session = Depends(get_db),
):
    """Return style radar axes for user vs. a grandmaster."""
    result = get_style_gap(username, gm, db)
    if result is None:
        raise HTTPException(status_code=404, detail=f"GM profile '{gm}' not found. Run: python -m gm.seed_gms --slug {gm}")
    return result


@app.get("/blunders/{username}")
async def get_blunders(
    username: str,
    tc: str | None = Query(default=None, description="bullet, blitz, rapid, classical, or all"),
    db: Session = Depends(get_db),
):
    """Return example blunder positions (with FEN) grouped by tactical theme."""
    return {"blunders": get_blunder_examples(username, db, tc=tc)}


@app.get("/openings/{username}")
async def get_openings(
    username: str,
    tc: str | None = Query(default=None, description="bullet, blitz, rapid, classical, or all"),
    db: Session = Depends(get_db),
):
    """Return opening repertoire stats split by color."""
    return aggregate_openings(username, db, tc)

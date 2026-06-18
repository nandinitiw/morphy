"""
Download PGN game collections for GM style analysis.

Lichess API (free, no auth required):
  GET https://lichess.org/api/games/user/{username}
  Headers: Accept: application/x-chess-pgn
  Rate limit: ~20 req/min unauthenticated. We download in one streamed request.

Historical GMs (Morphy, Fischer, Tal, Kasparov) don't have Lichess accounts.
Download their PGN files manually from a free source such as:
  https://www.pgnmentor.com/files.html   (select player → download zip → extract .pgn)
Place each file in backend/gm/pgns/<slug>.pgn  (e.g. pgns/fischer.pgn).

The seed script will use those local files if present, or fall back to Lichess for
players who have an account listed in LICHESS_USERNAMES below.
"""

from __future__ import annotations

import time
from pathlib import Path

import httpx

# Map our internal slug → Lichess username (for GMs with online accounts)
LICHESS_USERNAMES: dict[str, str] = {
    "carlsen": "DrNykterstein",   # Magnus Carlsen's main Lichess blitz/rapid account
}

LICHESS_API = "https://lichess.org/api/games/user/{username}"
# Download classical + rapid games to get longer, more representative games
LICHESS_PARAMS = {
    "max": 500,
    "perfType": "classical,rapid",
    "pgnInJson": "false",
    "clocks": "false",
    "evals": "false",
    "opening": "false",
}

PGN_DIR = Path(__file__).parent / "pgns"


def pgn_path(slug: str) -> Path:
    return PGN_DIR / f"{slug}.pgn"


def download_lichess(slug: str) -> str | None:
    """Download up to 500 classical/rapid games from Lichess for the given slug."""
    username = LICHESS_USERNAMES.get(slug)
    if not username:
        return None

    url = LICHESS_API.format(username=username)
    print(f"[download] Fetching Lichess games for {username} …")

    try:
        with httpx.stream(
            "GET",
            url,
            params=LICHESS_PARAMS,
            headers={"Accept": "application/x-chess-pgn"},
            timeout=60,
        ) as resp:
            resp.raise_for_status()
            pgn_text = resp.read().decode("utf-8")

        if not pgn_text.strip():
            print(f"[download] No games returned for {username}")
            return None

        # Polite: sleep between API calls
        time.sleep(2)

        path = pgn_path(slug)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(pgn_text, encoding="utf-8")
        game_count = pgn_text.count("[Event ")
        print(f"[download] Saved {game_count} games → {path}")
        return pgn_text

    except httpx.HTTPError as e:
        print(f"[download] HTTP error for {username}: {e}")
        return None


def load_pgn(slug: str) -> str | None:
    """
    Return PGN text for slug from local file, or download from Lichess if possible.
    Returns None if neither source is available.
    """
    path = pgn_path(slug)
    if path.exists():
        text = path.read_text(encoding="utf-8")
        print(f"[download] Loaded {path.name} from disk ({text.count('[Event ')} games)")
        return text

    # Try Lichess download
    text = download_lichess(slug)
    if text:
        return text

    print(
        f"[download] No PGN found for '{slug}'. "
        f"Download from https://www.pgnmentor.com/files.html and save to {path}"
    )
    return None

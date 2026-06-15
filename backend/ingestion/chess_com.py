import asyncio
import os
from datetime import datetime
from typing import AsyncIterator

import httpx

BASE_URL = "https://api.chess.com/pub/player"
REQUEST_TIMEOUT = float(os.getenv("CHESS_COM_TIMEOUT", "30"))
INGEST_MONTHS_BACK = int(os.getenv("INGEST_MONTHS_BACK", "6"))


async def fetch_monthly_games(
    client: httpx.AsyncClient,
    username: str,
    year: int,
    month: int,
) -> list[dict]:
    url = f"{BASE_URL}/{username}/games/{year}/{month:02d}"
    resp = await client.get(
        url,
        headers={"User-Agent": "chess-coach-app/1.0"},
        timeout=REQUEST_TIMEOUT,
    )
    if resp.status_code == 404:
        return []
    resp.raise_for_status()
    return resp.json().get("games", [])


def _month_range(months_back: int) -> list[tuple[int, int]]:
    """Return (year, month) pairs from months_back ago through today."""

    now = datetime.now()
    year, month = now.year, now.month

    months: list[tuple[int, int]] = []
    for _ in range(months_back):
        months.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1

    months.reverse()
    return months


async def fetch_all_games(
    username: str,
    since_year: int | None = None,
    months_back: int | None = None,
) -> AsyncIterator[dict]:
    """Yield games month by month, newest archives first."""

    username = username.strip().lower()
    if not username:
        return

    async with httpx.AsyncClient() as client:
        if since_year is not None:
            now = datetime.now()
            for year in range(since_year, now.year + 1):
                for month in range(1, 13):
                    if year == now.year and month > now.month:
                        break
                    games = await fetch_monthly_games(client, username, year, month)
                    for game in games:
                        yield game
                    await asyncio.sleep(0.25)
            return

        lookback = months_back if months_back is not None else INGEST_MONTHS_BACK
        for year, month in reversed(_month_range(lookback)):
            games = await fetch_monthly_games(client, username, year, month)
            for game in games:
                yield game
            await asyncio.sleep(0.25)

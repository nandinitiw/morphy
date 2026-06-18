"""
Seed grandmaster style profiles into the database.

Usage:
    cd backend
    python -m gm.seed_gms                   # seed all GMs
    python -m gm.seed_gms --slug carlsen     # seed one GM

For historical GMs (morphy, fischer, tal, kasparov), place their PGN files at:
    backend/gm/pgns/<slug>.pgn
Download free PGN collections from https://www.pgnmentor.com/files.html

For Carlsen, games are auto-downloaded from the Lichess API.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

# Allow running as a module from the backend directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from db.database import SessionLocal
from db.models import Base, GmProfile
from gm.compute_style import compute_style
from gm.download import load_pgn

# ── GM registry ──────────────────────────────────────────────────────────────
# player_name must match names as they appear in PGN White/Black headers.
# For pgnmentor.com files the format is usually "Morphy, Paul" or "Tal, Mikhail".
# Adjust player_name if your PGN files use a different format.

GM_REGISTRY: list[dict] = [
    {
        "slug":        "morphy",
        "display_name": "Paul Morphy",
        "birth_year":  1837,
        "player_name": "Morphy",       # substring matched against White/Black headers
    },
    {
        "slug":        "tal",
        "display_name": "Mikhail Tal",
        "birth_year":  1936,
        "player_name": "Tal",
    },
    {
        "slug":        "fischer",
        "display_name": "Bobby Fischer",
        "birth_year":  1943,
        "player_name": "Fischer",
    },
    {
        "slug":        "kasparov",
        "display_name": "Garry Kasparov",
        "birth_year":  1963,
        "player_name": "Kasparov",
    },
    {
        "slug":        "carlsen",
        "display_name": "Magnus Carlsen",
        "birth_year":  1990,
        "player_name": "DrNykterstein",  # Lichess username appears in headers
    },
]
# ─────────────────────────────────────────────────────────────────────────────


def seed_gm(gm: dict, db) -> bool:
    pgn_text = load_pgn(gm["slug"])
    if not pgn_text:
        print(f"[seed] Skipping {gm['slug']} — no PGN data available.")
        return False

    print(f"[seed] Computing style for {gm['display_name']} …")
    style = compute_style(pgn_text, gm["player_name"])
    if not style:
        print(f"[seed] No matching games found for player_name='{gm['player_name']}'. "
              f"Check that player_name matches the PGN White/Black headers.")
        return False

    print(f"[seed]   {style['games_analyzed']} games · axes: "
          f"dev={style['development']} of={style['open_files']} "
          f"ka={style['king_attack']} sac={style['sacrifice_rate']} agg={style['aggression']}")

    existing = db.query(GmProfile).filter_by(slug=gm["slug"]).first()
    if existing:
        profile = existing
    else:
        profile = GmProfile(slug=gm["slug"])
        db.add(profile)

    profile.display_name      = gm["display_name"]
    profile.birth_year        = gm["birth_year"]
    profile.development       = style["development"]
    profile.open_files        = style["open_files"]
    profile.king_attack       = style["king_attack"]
    profile.sacrifice_rate    = style["sacrifice_rate"]
    profile.aggression        = style["aggression"]
    profile.games_analyzed    = style["games_analyzed"]
    profile.avg_game_length   = style["avg_game_length"]
    profile.sacrifice_rate_pct = style["sacrifice_rate_pct"]
    profile.open_file_pct     = style["open_file_pct"]
    profile.king_attack_pct   = style["king_attack_pct"]
    profile.development_speed = style["development_speed"]
    profile.updated_at        = datetime.now()
    db.commit()

    print(f"[seed] ✓ {gm['display_name']} saved.")
    return True


def main():
    parser = argparse.ArgumentParser(description="Seed GM style profiles")
    parser.add_argument("--slug", help="Seed only this GM slug")
    args = parser.parse_args()

    # Create table if it doesn't exist yet
    from db.database import engine as _engine
    Base.metadata.create_all(_engine)

    db = SessionLocal()
    try:
        targets = [g for g in GM_REGISTRY if not args.slug or g["slug"] == args.slug]
        if not targets:
            print(f"[seed] Unknown slug '{args.slug}'. Available: {[g['slug'] for g in GM_REGISTRY]}")
            sys.exit(1)

        for gm in targets:
            seed_gm(gm, db)
    finally:
        db.close()


if __name__ == "__main__":
    main()

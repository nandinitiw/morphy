"""Build a user's weakness profile by aggregating their blunders per tactical motif.

Note: this groups blunders by the motif label the classifier already assigned —
it is not statistical clustering. Each motif becomes one weakness row with a
frequency (how often it happened) and a severity (average centipawn loss).
"""
from datetime import datetime

from db.models import Game, Position, WeaknessProfile


def update_weakness_profile(username: str, blunder_positions: list[Position], db) -> list[WeaknessProfile]:
    """Group the given blunders by tactical motif and upsert one profile per motif."""
    if not blunder_positions:
        return []

    motif_groups: dict[str, list[Position]] = {}
    for pos in blunder_positions:
        motif = pos.tactical_motif or "positional"
        motif_groups.setdefault(motif, []).append(pos)

    profiles = [_upsert_profile(username, motif, positions, db)
                for motif, positions in motif_groups.items()]
    db.commit()
    return profiles


def refresh_weakness_profile(username: str, db) -> list[WeaknessProfile]:
    blunders = (
        db.query(Position)
        .join(Game)
        .filter(
            Game.username == username,
            Position.is_your_move.is_(True),
            Position.classification == "blunder",
        )
        .all()
    )
    return update_weakness_profile(username, blunders, db)


def _upsert_profile(username, motif, positions, db) -> WeaknessProfile:
    existing = db.query(WeaknessProfile).filter_by(username=username, theme=motif).first()
    cp_losses = [p.centipawn_loss for p in positions if p.centipawn_loss is not None]
    avg_cp_loss = sum(cp_losses) / len(cp_losses) if cp_losses else 0.0
    dates = [p.game.played_at for p in positions if p.game and p.game.played_at]

    profile = existing or WeaknessProfile(username=username, theme=motif)
    profile.frequency = len(positions)
    profile.severity = float(avg_cp_loss)
    profile.last_seen = max(dates) if dates else (existing.last_seen if existing else datetime.now())
    profile.updated_at = datetime.now()

    if existing is None:
        db.add(profile)
    return profile

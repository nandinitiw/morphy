import numpy as np
from db.models import Game, Position, WeaknessProfile
from datetime import datetime

THEME_LABELS = {
    "missed_fork": "Fork Blindspot",
    "missed_pin": "Pin Recognition",
    "missed_back_rank": "Back-Rank Awareness",
    "king_safety": "King Safety",
    "missed_check": "Missed Checks",
    "positional": "Positional Judgment",
}

def update_weakness_profile(username: str, blunder_positions: list[Position], db) -> list[WeaknessProfile]:
    """
    Re-cluster all blunders and update the weakness profile.
    Called after each new batch of analyzed games.
    """

    if not blunder_positions:
        return []
    # Group by tactical motif first, then cluster within each group
    motif_groups = {}
    for pos in blunder_positions:
        motif = pos.tactical_motif or "positional"
        motif_groups.setdefault(motif, []).append(pos)
    profiles = []

    for motif, positions in motif_groups.items():
        embeddings = np.array([pos.embedding for pos in positions if pos.embedding])
        centroid = embeddings.mean(axis=0).tolist() if len(embeddings) >= 3 else None
        profile = _upsert_profile(username, motif, positions, centroid, db)
        profiles.append(profile)

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


def _upsert_profile(username, motif, positions, centroid, db) -> WeaknessProfile:

    existing = db.query(WeaknessProfile).filter_by(username=username, theme=motif).first()
    cp_losses = [p.centipawn_loss for p in positions if p.centipawn_loss is not None]
    avg_cp_loss = np.mean(cp_losses) if cp_losses else 0.0

    if existing:
        existing.frequency = len(positions)
        existing.severity = float(avg_cp_loss)
        dates = [p.game.played_at for p in positions if p.game and p.game.played_at]
        existing.last_seen = max(dates) if dates else existing.last_seen
        existing.centroid = centroid
        existing.updated_at = datetime.now()

        return existing

    else:
        profile = WeaknessProfile(
            username=username,
            theme=motif,
            frequency=len(positions),
            severity=float(avg_cp_loss),
            last_seen=datetime.now(),
            centroid=centroid,
            updated_at=datetime.now(),

        )

        db.add(profile)
        return profile

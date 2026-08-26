"""Leitner-style spaced repetition over a user's own blundered positions.

The Trainer drills positions the user got wrong. Rather than showing every
position once, we schedule reviews: a position answered correctly is promoted to
a higher box and won't resurface for a while; a wrong answer demotes it so it
comes back soon. Positions the user keeps failing stay in rotation until they
stick — "you keep missing back-rank, here are more" falls out of this naturally.

State lives in the DrillCard table (one row per user+position), so schedules
survive restarts on the durable Postgres.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from db.models import DrillCard, Game, Position

# Leitner boxes 0..5. Values are days until a card in that box is due again.
# Box 0 is due immediately (same session); the top box is the long-term slot.
BOX_INTERVALS_DAYS = [0, 1, 3, 7, 16, 35]
MASTERED_BOX = len(BOX_INTERVALS_DAYS) - 1  # 5 — reached the top box

# The demo is a single shared showcase account, so its drill progress must stay
# stateless — otherwise one visitor's attempts would follow the next. The UI
# already skips these writes for demo; this guard makes the invariant hold even
# for direct API calls.
DEMO_USERNAME = "demo"


def _next_due(box: int, from_time: datetime) -> datetime:
    days = BOX_INTERVALS_DAYS[min(box, MASTERED_BOX)]
    return from_time + timedelta(days=days)


def is_mastered(card: DrillCard) -> bool:
    return (card.box or 0) >= MASTERED_BOX


def record_attempt(username: str, position_id: int, correct: bool, db: Session) -> DrillCard:
    """Create or update the drill card for this attempt and reschedule it.

    Correct → promote one box; wrong → demote one box (never below 0). The card's
    next_due_at is recomputed from the new box.
    """
    now = datetime.now()

    if username.lower() == DEMO_USERNAME:
        # Compute what the card *would* be so the UI still shows scheduling
        # feedback, but return it detached — never persisted.
        box = 1 if correct else 0
        return DrillCard(
            username=DEMO_USERNAME,
            position_id=position_id,
            box=box,
            attempts=1,
            correct=1 if correct else 0,
            streak=1 if correct else 0,
            last_reviewed_at=now,
            next_due_at=_next_due(box, now),
            created_at=now,
        )

    card = (
        db.query(DrillCard)
        .filter_by(username=username.lower(), position_id=position_id)
        .first()
    )
    if card is None:
        position = db.query(Position).filter_by(id=position_id).first()
        card = DrillCard(
            username=username.lower(),
            position_id=position_id,
            theme=position.tactical_motif if position else None,
            box=0,
            attempts=0,
            correct=0,
            streak=0,
            created_at=now,
        )
        db.add(card)

    card.attempts = (card.attempts or 0) + 1
    if correct:
        card.correct = (card.correct or 0) + 1
        card.streak = (card.streak or 0) + 1
        card.box = min(MASTERED_BOX, (card.box or 0) + 1)
    else:
        card.streak = 0
        card.box = max(0, (card.box or 0) - 1)

    card.last_reviewed_at = now
    card.next_due_at = _next_due(card.box, now)
    db.commit()
    db.refresh(card)
    return card


def _position_payload(pos: Position, card: DrillCard | None) -> dict:
    """Shape a position (plus any drill state) for the Trainer."""
    return {
        "position_id": pos.id,
        "theme": pos.tactical_motif,
        "fen": pos.fen,
        "move_played": pos.move_played,
        "best_move": pos.best_move,
        "centipawn_loss": round(pos.centipawn_loss) if pos.centipawn_loss else 0,
        "game_id": pos.game_id,
        "move_number": pos.move_number,
        # Drill state (null for brand-new positions the user hasn't seen here yet)
        "is_review": card is not None,
        "box": card.box if card else 0,
        "times_seen": card.attempts if card else 0,
        "mastered": is_mastered(card) if card else False,
    }


def get_drill_queue(
    username: str, db: Session, theme: str | None = None, limit: int = 20
) -> list[dict]:
    """Return the positions to drill next: due reviews first, then fresh material.

    Overdue review cards (next_due_at <= now) come first, most-overdue first.
    Mastered cards are held back unless they fall due again. Any remaining slots
    are filled with blunder positions the user hasn't carded yet (new material),
    worst blunders first.
    """
    now = datetime.now()
    uname = username.lower()

    # 1. Due review cards (skip mastered ones that aren't due yet is implicit —
    #    mastered cards still resurface once their long interval elapses).
    due_q = (
        db.query(DrillCard, Position)
        .join(Position, DrillCard.position_id == Position.id)
        .filter(DrillCard.username == uname, DrillCard.next_due_at <= now)
    )
    if theme:
        due_q = due_q.filter(DrillCard.theme == theme)
    due_cards = due_q.order_by(DrillCard.next_due_at.asc()).limit(limit).all()

    results = [_position_payload(pos, card) for card, pos in due_cards]
    carded_ids = {card.position_id for card, _ in due_cards}

    # 2. Fill remaining slots with new (un-carded) blunder positions.
    if len(results) < limit:
        carded_all = {
            row[0]
            for row in db.query(DrillCard.position_id).filter(DrillCard.username == uname).all()
        }
        new_q = (
            db.query(Position)
            .join(Game)
            .filter(
                Game.username == uname,
                Position.is_your_move.is_(True),
                Position.classification == "blunder",
                Position.tactical_motif.isnot(None),
                Position.fen.isnot(None),
                Position.best_move.isnot(None),
            )
        )
        if theme:
            new_q = new_q.filter(Position.tactical_motif == theme)
        new_positions = new_q.order_by(Position.centipawn_loss.desc()).all()
        for pos in new_positions:
            if len(results) >= limit:
                break
            if pos.id in carded_all or pos.id in carded_ids:
                continue
            results.append(_position_payload(pos, None))

    return results


def get_mastery(username: str, db: Session, theme: str | None = None) -> list[dict]:
    """Per-theme drill progress: how many positions exist, are carded, mastered, due."""
    now = datetime.now()
    uname = username.lower()

    # Total distinct blunder positions available to drill, per theme.
    pos_q = (
        db.query(Position.tactical_motif, Position.id)
        .join(Game)
        .filter(
            Game.username == uname,
            Position.is_your_move.is_(True),
            Position.classification == "blunder",
            Position.tactical_motif.isnot(None),
            Position.fen.isnot(None),
            Position.best_move.isnot(None),
        )
    )
    if theme:
        pos_q = pos_q.filter(Position.tactical_motif == theme)

    totals: dict[str, int] = {}
    for motif, _pid in pos_q.all():
        totals[motif] = totals.get(motif, 0) + 1

    cards_q = db.query(DrillCard).filter(DrillCard.username == uname)
    if theme:
        cards_q = cards_q.filter(DrillCard.theme == theme)
    cards = cards_q.all()

    by_theme: dict[str, dict] = {}
    for card in cards:
        entry = by_theme.setdefault(
            card.theme, {"carded": 0, "mastered": 0, "due": 0, "attempts": 0, "correct": 0}
        )
        entry["carded"] += 1
        entry["attempts"] += card.attempts or 0
        entry["correct"] += card.correct or 0
        if is_mastered(card):
            entry["mastered"] += 1
        if card.next_due_at is not None and card.next_due_at <= now:
            entry["due"] += 1

    results = []
    for motif, total in sorted(totals.items(), key=lambda kv: kv[1], reverse=True):
        stats = by_theme.get(motif, {})
        attempts = stats.get("attempts", 0)
        results.append(
            {
                "theme": motif,
                "total_positions": total,
                "carded": stats.get("carded", 0),
                "mastered": stats.get("mastered", 0),
                "due": stats.get("due", 0),
                "solve_rate": round(100 * stats.get("correct", 0) / attempts) if attempts else None,
            }
        )
    return results

"""Tests for the Leitner spaced-repetition drill scheduler."""
from datetime import datetime, timedelta

from db.models import DrillCard
from profiler.spaced_repetition import (
    BOX_INTERVALS_DAYS,
    MASTERED_BOX,
    get_drill_queue,
    get_mastery,
    is_mastered,
    record_attempt,
)
from tests.conftest import make_blunder, make_game


def _seed(db, n=3, motif="missed_fork", username="testuser"):
    game = make_game(db, id=f"g-{motif}", username=username)
    positions = [make_blunder(db, game_id=game.id, move=10 + i, motif=motif) for i in range(n)]
    db.commit()
    return positions


class TestRecordAttempt:
    def test_correct_promotes_and_schedules(self, db):
        pos = _seed(db, n=1)[0]
        card = record_attempt("testuser", pos.id, correct=True, db=db)
        assert card.box == 1
        assert card.streak == 1
        assert card.attempts == 1
        assert card.correct == 1
        # due one box-1 interval out
        expected = card.last_reviewed_at + timedelta(days=BOX_INTERVALS_DAYS[1])
        assert abs((card.next_due_at - expected).total_seconds()) < 2

    def test_wrong_demotes_never_below_zero(self, db):
        pos = _seed(db, n=1)[0]
        record_attempt("testuser", pos.id, correct=True, db=db)   # box 1
        card = record_attempt("testuser", pos.id, correct=False, db=db)  # back to 0
        assert card.box == 0
        assert card.streak == 0
        # already at 0, another wrong stays at 0
        card = record_attempt("testuser", pos.id, correct=False, db=db)
        assert card.box == 0

    def test_upserts_single_card_per_user_position(self, db):
        pos = _seed(db, n=1)[0]
        record_attempt("testuser", pos.id, correct=True, db=db)
        record_attempt("testuser", pos.id, correct=True, db=db)
        cards = db.query(DrillCard).filter_by(username="testuser", position_id=pos.id).all()
        assert len(cards) == 1
        assert cards[0].attempts == 2

    def test_username_is_lowercased(self, db):
        pos = _seed(db, n=1)[0]
        record_attempt("TestUser", pos.id, correct=True, db=db)
        card = db.query(DrillCard).filter_by(username="testuser", position_id=pos.id).first()
        assert card is not None

    def test_reaches_mastered(self, db):
        pos = _seed(db, n=1)[0]
        card = None
        for _ in range(MASTERED_BOX + 2):
            card = record_attempt("testuser", pos.id, correct=True, db=db)
        assert card.box == MASTERED_BOX
        assert is_mastered(card)


class TestDemoIsStateless:
    """The demo is a shared showcase account — drill attempts must not persist."""

    def test_demo_attempt_is_not_persisted(self, db):
        pos = _seed(db, n=1, username="demo")[0]
        record_attempt("demo", pos.id, correct=True, db=db)
        assert db.query(DrillCard).filter_by(username="demo").count() == 0

    def test_demo_attempt_still_returns_usable_feedback(self, db):
        pos = _seed(db, n=1, username="demo")[0]
        card = record_attempt("demo", pos.id, correct=True, db=db)
        assert card.box == 1
        assert card.next_due_at is not None
        wrong = record_attempt("demo", pos.id, correct=False, db=db)
        assert wrong.box == 0

    def test_demo_mastery_stays_empty(self, db):
        positions = _seed(db, n=2, username="demo")
        for p in positions:
            record_attempt("demo", p.id, correct=True, db=db)
        mastery = get_mastery("demo", db)
        assert all(m["carded"] == 0 for m in mastery)

    def test_real_users_still_persist(self, db):
        pos = _seed(db, n=1, username="realuser")[0]
        record_attempt("realuser", pos.id, correct=True, db=db)
        assert db.query(DrillCard).filter_by(username="realuser").count() == 1


class TestDrillQueue:
    def test_new_positions_when_no_cards(self, db):
        _seed(db, n=3)
        queue = get_drill_queue("testuser", db)
        assert len(queue) == 3
        assert all(not p["is_review"] for p in queue)

    def test_due_reviews_come_first(self, db):
        positions = _seed(db, n=3)
        # Card one position and force it overdue.
        card = record_attempt("testuser", positions[0].id, correct=False, db=db)
        card.next_due_at = datetime.now() - timedelta(days=1)
        db.commit()
        queue = get_drill_queue("testuser", db)
        assert queue[0]["position_id"] == positions[0].id
        assert queue[0]["is_review"] is True

    def test_not_due_cards_are_held_back(self, db):
        positions = _seed(db, n=2)
        # Answer one correctly → due far in the future → should not appear as a review,
        # and since it's carded it isn't offered as "new" either.
        record_attempt("testuser", positions[0].id, correct=True, db=db)
        queue = get_drill_queue("testuser", db)
        ids = {p["position_id"] for p in queue}
        assert positions[0].id not in ids
        assert positions[1].id in ids

    def test_theme_filter(self, db):
        _seed(db, n=2, motif="missed_fork")
        _seed(db, n=2, motif="missed_pin")
        queue = get_drill_queue("testuser", db, theme="missed_pin")
        assert len(queue) == 2
        assert all(p["theme"] == "missed_pin" for p in queue)

    def test_respects_limit(self, db):
        _seed(db, n=5)
        queue = get_drill_queue("testuser", db, limit=2)
        assert len(queue) == 2


class TestMastery:
    def test_counts_totals_and_mastered(self, db):
        positions = _seed(db, n=3, motif="missed_fork")
        # Master one position.
        for _ in range(MASTERED_BOX + 1):
            record_attempt("testuser", positions[0].id, correct=True, db=db)
        # Attempt another once (carded, not mastered).
        record_attempt("testuser", positions[1].id, correct=False, db=db)

        mastery = get_mastery("testuser", db)
        fork = next(m for m in mastery if m["theme"] == "missed_fork")
        assert fork["total_positions"] == 3
        assert fork["carded"] == 2
        assert fork["mastered"] == 1

    def test_solve_rate_none_when_no_attempts(self, db):
        _seed(db, n=2)
        mastery = get_mastery("testuser", db)
        assert mastery[0]["solve_rate"] is None

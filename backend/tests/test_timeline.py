"""Tests for stats.build_timeline — per-game accuracy over time."""
from datetime import datetime

from db.models import Position
from stats import build_timeline
from tests.conftest import make_game


def _add_move(db, game_id, cp_loss, *, blunder=False):
    db.add(
        Position(
            game_id=game_id,
            move_number=10,
            fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
            move_played="e2e4",
            best_move="d2d4",
            centipawn_loss=cp_loss,
            classification="blunder" if blunder else "inaccuracy",
            is_your_move=True,
        )
    )


class TestBuildTimeline:
    def test_empty_when_no_games(self, db):
        assert build_timeline("nobody", db) == {"points": []}

    def test_one_point_per_game_sorted_oldest_first(self, db):
        g1 = make_game(db, id="g1", username="alice")
        g1.played_at = datetime(2024, 3, 1)
        g2 = make_game(db, id="g2", username="alice")
        g2.played_at = datetime(2024, 1, 1)
        _add_move(db, "g1", 100)
        _add_move(db, "g2", 40)
        db.commit()

        pts = build_timeline("alice", db)["points"]
        assert [p["game_id"] for p in pts] == ["g2", "g1"]  # oldest first
        assert pts[0]["date"] == "2024-01-01"

    def test_avg_cp_loss_and_blunder_count(self, db):
        g = make_game(db, id="g1", username="alice")
        g.played_at = datetime(2024, 2, 2)
        _add_move(db, "g1", 20)
        _add_move(db, "g1", 200, blunder=True)
        _add_move(db, "g1", 380, blunder=True)
        db.commit()

        pt = build_timeline("alice", db)["points"][0]
        assert pt["avg_cp_loss"] == 200.0  # (20+200+380)/3
        assert pt["blunders"] == 2

    def test_games_without_played_at_are_excluded(self, db):
        g = make_game(db, id="g1", username="alice")
        g.played_at = None
        _add_move(db, "g1", 100)
        db.commit()
        assert build_timeline("alice", db)["points"] == []

    def test_tc_filter(self, db):
        g1 = make_game(db, id="g1", username="alice", tc="180")   # blitz
        g1.played_at = datetime(2024, 1, 1)
        g2 = make_game(db, id="g2", username="alice", tc="600")   # rapid
        g2.played_at = datetime(2024, 1, 2)
        _add_move(db, "g1", 50)
        _add_move(db, "g2", 90)
        db.commit()

        rapid = build_timeline("alice", db, tc="rapid")["points"]
        assert [p["game_id"] for p in rapid] == ["g2"]

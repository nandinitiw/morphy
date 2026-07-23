"""Tests for stats.py — TC filtering, blunder aggregation, style computation."""
from __future__ import annotations

import pytest

from stats import (
    build_profile,
    classify_time_control,
    compute_user_style,
    get_blunder_examples,
)
from tests.conftest import make_blunder, make_game


# ---------------------------------------------------------------------------
# classify_time_control
# ---------------------------------------------------------------------------

class TestClassifyTimeControl:
    def test_bullet(self):
        assert classify_time_control("60+0") == "bullet"
        assert classify_time_control("120+1") == "bullet"

    def test_blitz(self):
        assert classify_time_control("180+0") == "blitz"
        assert classify_time_control("300+3") == "blitz"

    def test_rapid(self):
        assert classify_time_control("600+0") == "rapid"
        assert classify_time_control("900+10") == "rapid"

    def test_classical(self):
        assert classify_time_control("1800+0") == "classical"
        assert classify_time_control("3600+30") == "classical"

    def test_none_is_other(self):
        assert classify_time_control(None) == "other"

    def test_unknown_string_is_other(self):
        assert classify_time_control("daily") == "other"
        assert classify_time_control("") == "other"


# ---------------------------------------------------------------------------
# build_profile — TC filtering and blunder count isolation
# ---------------------------------------------------------------------------

class TestBuildProfile:
    def test_all_tc_returns_all_games(self, db):
        make_game(db, id="g1", tc="600+0")   # rapid
        make_game(db, id="g2", tc="300+0")   # blitz
        result = build_profile("testuser", db, tc=None)
        assert result["stats"]["games_analyzed"] == 2

    def test_tc_filter_isolates_games(self, db):
        make_game(db, id="g1", tc="600+0")   # rapid
        make_game(db, id="g2", tc="300+0")   # blitz
        result = build_profile("testuser", db, tc="rapid")
        assert result["stats"]["games_analyzed"] == 1

    def test_empty_tc_returns_zero_stats(self, db):
        make_game(db, id="g1", tc="600+0")   # rapid only
        result = build_profile("testuser", db, tc="blitz")
        assert result["stats"]["games_analyzed"] == 0
        assert result["stats"]["total_blunders"] == 0
        assert result["stats"]["blunder_rate"] == 0

    def test_total_blunders_does_not_leak_across_tc(self, db):
        """Regression: blitz query used to return all-time blunder count."""
        g_rapid = make_game(db, id="g1", tc="600+0")
        make_blunder(db, game_id="g1", cp_loss=400)  # rapid blunder
        make_blunder(db, game_id="g1", cp_loss=500)

        result = build_profile("testuser", db, tc="blitz")
        assert result["stats"]["total_blunders"] == 0  # must not leak rapid blunders

    def test_blunder_rate_computed_correctly(self, db):
        make_game(db, id="g1", tc="600+0")
        make_blunder(db, game_id="g1", cp_loss=400)
        make_blunder(db, game_id="g1", cp_loss=250)
        result = build_profile("testuser", db, tc="rapid")
        assert result["stats"]["total_blunders"] == 2
        assert result["stats"]["blunder_rate"] > 0

    def test_profile_empty_list_on_no_tc_games(self, db):
        make_game(db, id="g1", tc="600+0")
        result = build_profile("testuser", db, tc="blitz")
        assert result["profile"] == []

    def test_profile_lookup_lowercases_query(self, db):
        # Ingestion always stores usernames lowercase; profile() lowercases the query param
        make_game(db, id="g1", username="testuser", tc="600+0")
        result = build_profile("TestUser", db)  # mixed-case input should still match
        assert result["stats"]["games_analyzed"] == 1


# ---------------------------------------------------------------------------
# get_blunder_examples — TC filter
# ---------------------------------------------------------------------------

class TestGetBlunderExamples:
    def test_returns_blunders_for_matching_tc(self, db):
        make_game(db, id="g1", tc="600+0")
        make_blunder(db, game_id="g1", motif="missed_fork")
        result = get_blunder_examples("testuser", db, tc="rapid")
        assert len(result) == 1
        assert result[0]["theme"] == "missed_fork"

    def test_empty_when_no_games_for_tc(self, db):
        make_game(db, id="g1", tc="600+0")   # rapid
        make_blunder(db, game_id="g1")
        result = get_blunder_examples("testuser", db, tc="blitz")
        assert result == []

    def test_no_tc_filter_returns_all(self, db):
        make_game(db, id="g1", tc="600+0")
        make_game(db, id="g2", tc="300+0")
        make_blunder(db, game_id="g1", motif="missed_fork")
        make_blunder(db, game_id="g2", motif="missed_pin")
        result = get_blunder_examples("testuser", db, tc=None)
        themes = {r["theme"] for r in result}
        assert "missed_fork" in themes
        assert "missed_pin" in themes

    def test_capped_at_limit_per_theme(self, db):
        make_game(db, id="g1", tc="600+0")
        for i in range(5):
            make_blunder(db, game_id="g1", motif="missed_fork", move=i + 1, cp_loss=300 - i)
        result = get_blunder_examples("testuser", db, limit_per_theme=3)
        fork_rows = [r for r in result if r["theme"] == "missed_fork"]
        assert len(fork_rows) == 3

    def test_sorted_by_centipawn_loss_descending(self, db):
        make_game(db, id="g1", tc="600+0")
        make_blunder(db, game_id="g1", motif="missed_fork", move=1, cp_loss=100)
        make_blunder(db, game_id="g1", motif="missed_pin", move=2, cp_loss=900)
        result = get_blunder_examples("testuser", db)
        assert result[0]["centipawn_loss"] >= result[-1]["centipawn_loss"]


# ---------------------------------------------------------------------------
# compute_user_style — PGN header matching
# ---------------------------------------------------------------------------

SAMPLE_PGN = """\
[Event "Live Chess"]
[White "demo"]
[Black "opponent"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 \
8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 1-0
"""

WRONG_HEADER_PGN = """\
[Event "Live Chess"]
[White "?"]
[Black "?"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0
"""


class TestComputeUserStyle:
    def test_returns_empty_when_no_pgn(self, db):
        make_game(db, id="g1", username="demo", raw_pgn=None)
        result = compute_user_style("demo", db)
        assert result == {}

    def test_returns_empty_when_username_not_in_headers(self, db):
        """Regression: seed used to write [White '?'] — style came back all zeros."""
        make_game(db, id="g1", username="demo", raw_pgn=WRONG_HEADER_PGN)
        result = compute_user_style("demo", db)
        assert result == {}

    def test_returns_axes_when_username_in_headers(self, db):
        make_game(db, id="g1", username="demo", raw_pgn=SAMPLE_PGN, color="white")
        result = compute_user_style("demo", db)
        assert result != {}
        for axis in ("decisiveness", "endgame_tendency", "patience", "simplification", "attack"):
            assert axis in result
            assert 0 <= result[axis] <= 100

    def test_games_analyzed_count(self, db):
        make_game(db, id="g1", username="demo", raw_pgn=SAMPLE_PGN, color="white")
        make_game(db, id="g2", username="demo", raw_pgn=SAMPLE_PGN, color="white")
        result = compute_user_style("demo", db)
        assert result.get("games_analyzed") == 2

    def test_only_analyzed_games_included(self, db):
        make_game(db, id="g1", username="demo", raw_pgn=SAMPLE_PGN, analyzed=False)
        result = compute_user_style("demo", db)
        assert result == {}

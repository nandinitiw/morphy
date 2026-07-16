"""Tests for gm/compute_style.py.

The original axes (development, open_files) measured competence rather than
style: every elite GM develops by move ~4.7 and puts rooks on open files ~46%
of the time, so all five radars looked identical. These tests guard the
replacement axes against silently regressing back into that state.
"""
import json

import pytest

from gm.compute_style import ENDGAME_MATERIAL, compute_style
from gm.seed_gms import PROFILES_JSON

AXES = ("decisiveness", "endgame_tendency", "king_attack", "sacrifice_rate", "aggression")

# A drawn game played in a bare king-and-pawn endgame (2 points of material,
# far below ENDGAME_MATERIAL). Uses a SetUp/FEN header rather than 40 moves of
# notation just to grind the material down.
DRAWN_ENDGAME_PGN = """[Event "Test"]
[White "Testplayer"]
[Black "Opponent"]
[Result "1/2-1/2"]
[SetUp "1"]
[FEN "7k/5p2/8/8/8/8/5P2/7K w - - 0 1"]

1. f4 f5 2. Kg2 Kg7 *
"""

# A decisive game that ends with the board still full.
DECISIVE_SHORT_PGN = """[Event "Test"]
[White "Testplayer"]
[Black "Opponent"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# *
"""


class TestAxisShape:
    def test_returns_all_axes(self):
        style = compute_style(DECISIVE_SHORT_PGN, "Testplayer")
        for axis in AXES:
            assert axis in style, f"missing axis {axis}"

    def test_dropped_axes_are_gone(self):
        # development/open_files are still computed as *stats*, never as axes.
        style = compute_style(DECISIVE_SHORT_PGN, "Testplayer")
        assert "development" not in style
        assert "open_files" not in style
        assert "development_speed" in style
        assert "open_file_pct" in style

    def test_axes_are_within_range(self):
        style = compute_style(DECISIVE_SHORT_PGN, "Testplayer")
        for axis in AXES:
            assert 0 <= style[axis] <= 100, f"{axis}={style[axis]} out of range"

    def test_no_matching_games_returns_empty(self):
        assert compute_style(DECISIVE_SHORT_PGN, "Nobody") == {}


class TestDecisiveness:
    def test_decisive_game_scores_higher_than_drawn(self):
        decisive = compute_style(DECISIVE_SHORT_PGN, "Testplayer")
        drawn = compute_style(DRAWN_ENDGAME_PGN, "Testplayer")
        assert decisive["decisiveness"] > drawn["decisiveness"]

    def test_decisive_pct_reported(self):
        assert compute_style(DECISIVE_SHORT_PGN, "Testplayer")["decisive_pct"] == "100%"

    def test_all_draws_report_zero_pct(self):
        assert compute_style(DRAWN_ENDGAME_PGN, "Testplayer")["decisive_pct"] == "0%"


class TestEndgameTendency:
    def test_game_reaching_endgame_scores_higher(self):
        endgame = compute_style(DRAWN_ENDGAME_PGN, "Testplayer")
        middlegame = compute_style(DECISIVE_SHORT_PGN, "Testplayer")
        assert endgame["endgame_tendency"] > middlegame["endgame_tendency"]

    def test_full_board_game_is_not_an_endgame(self):
        assert compute_style(DECISIVE_SHORT_PGN, "Testplayer")["endgame_pct"] == "0%"

    def test_endgame_threshold_is_below_starting_material(self):
        assert 0 < ENDGAME_MATERIAL < 78


class TestGmProfilesDiscriminate:
    """The whole point of the axis change: GMs must look different from each other."""

    @pytest.fixture(scope="class")
    def profiles(self):
        return json.loads(PROFILES_JSON.read_text())

    @pytest.mark.parametrize("axis,min_spread", [
        ("decisiveness", 40.0),
        ("endgame_tendency", 40.0),
        ("sacrifice_rate", 40.0),
    ])
    def test_axis_spreads_gms_apart(self, profiles, axis, min_spread):
        values = [p[axis] for p in profiles.values()]
        spread = max(values) - min(values)
        assert spread >= min_spread, (
            f"{axis} only spans {spread:.1f} points across GMs — it is not "
            f"discriminating between them (the bug the old axes had)"
        )

    def test_carlsen_reaches_more_endgames_than_morphy(self, profiles):
        # Sanity-check against chess reality: Carlsen grinds endgames, Morphy
        # finished games in the middlegame.
        assert profiles["carlsen"]["endgame_tendency"] > profiles["morphy"]["endgame_tendency"]

    def test_morphy_is_the_most_decisive(self, profiles):
        # 1850s romantic chess vs. weak opposition — almost no draws.
        top = max(profiles.items(), key=lambda kv: kv[1]["decisiveness"])[0]
        assert top == "morphy"

    def test_no_two_gms_have_identical_radars(self, profiles):
        shapes = {slug: tuple(p[a] for a in AXES) for slug, p in profiles.items()}
        assert len(set(shapes.values())) == len(shapes), "two GMs have identical radars"

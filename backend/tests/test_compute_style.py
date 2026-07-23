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

AXES = ("decisiveness", "endgame_tendency", "patience", "simplification", "attack")

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
        # Competence metrics (development, open files, king-attack zone, the old
        # aggression composite) are computed only as stats now, never as axes.
        style = compute_style(DECISIVE_SHORT_PGN, "Testplayer")
        for gone in ("development", "open_files", "king_attack", "sacrifice_rate", "aggression"):
            assert gone not in style, f"{gone} should not be an axis"
        assert "development_speed" in style  # still a stat
        assert "open_file_pct" in style      # still a stat

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

    @pytest.mark.parametrize("axis", AXES)
    def test_every_axis_spreads_gms_apart(self, profiles, axis):
        # Every axis must span a wide range across the GMs — an axis where they
        # cluster (like the old king-attack/checks) is what made the radars look
        # identical for everyone but Morphy.
        values = [p[axis] for p in profiles.values()]
        spread = max(values) - min(values)
        assert spread >= 40.0, f"{axis} only spans {spread:.1f} points across GMs"

    def test_no_two_gm_radars_are_close(self, profiles):
        # The real regression guard: every pair of GMs must be visibly distinct on
        # the radar, not just Morphy-vs-everyone. Euclidean distance across the five
        # 0–100 axes; the closest pair should still be clearly separated.
        import itertools, math
        pts = {s: [p[a] for a in AXES] for s, p in profiles.items()}
        closest = min(
            math.dist(pts[a], pts[b]) for a, b in itertools.combinations(pts, 2)
        )
        assert closest >= 25.0, f"closest GM pair is only {closest:.1f} apart on the radar"

    def test_carlsen_reaches_more_endgames_than_morphy(self, profiles):
        # Sanity-check against chess reality: Carlsen grinds endgames, Morphy
        # finished games in the middlegame.
        assert profiles["carlsen"]["endgame_tendency"] > profiles["morphy"]["endgame_tendency"]

    def test_carlsen_plays_longer_than_morphy(self, profiles):
        assert profiles["carlsen"]["patience"] > profiles["morphy"]["patience"]

    def test_morphy_is_the_most_decisive_and_attacking(self, profiles):
        # 1850s romantic chess vs. weak opposition — almost no draws, lots of checks.
        assert max(profiles.items(), key=lambda kv: kv[1]["decisiveness"])[0] == "morphy"
        assert max(profiles.items(), key=lambda kv: kv[1]["attack"])[0] == "morphy"

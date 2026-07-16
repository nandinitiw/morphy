"""Tests for gm/seed_gms.py — GM profiles must seed from the committed
profiles.json, since deployed images have no PGN corpus (it's gitignored)."""
import json

from db.models import GmProfile
from gm.seed_gms import GM_REGISTRY, PROFILES_JSON, STYLE_FIELDS, load_precomputed, seed_gm


class TestProfilesJson:
    def test_profiles_json_is_committed(self):
        # Regression: PGNs are gitignored, so without this file a deploy seeds
        # zero GMs and every /style-gap request 404s.
        assert PROFILES_JSON.is_file(), f"{PROFILES_JSON} must be committed"

    def test_every_registered_gm_has_a_precomputed_profile(self):
        data = json.loads(PROFILES_JSON.read_text())
        for gm in GM_REGISTRY:
            assert gm["slug"] in data, f"no precomputed profile for {gm['slug']}"

    def test_profiles_have_all_style_fields(self):
        data = json.loads(PROFILES_JSON.read_text())
        for slug, profile in data.items():
            for field in STYLE_FIELDS:
                assert field in profile, f"{slug} missing {field}"

    def test_style_axes_are_in_range(self):
        data = json.loads(PROFILES_JSON.read_text())
        axes = ("development", "open_files", "king_attack", "sacrifice_rate", "aggression")
        for slug, profile in data.items():
            for axis in axes:
                assert 0 <= profile[axis] <= 100, f"{slug}.{axis} out of range"

    def test_load_precomputed_returns_known_gm(self):
        assert load_precomputed("morphy") is not None

    def test_load_precomputed_returns_none_for_unknown(self):
        assert load_precomputed("not_a_real_gm") is None


class TestSeedGm:
    def test_seeds_from_precomputed_without_pgn(self, db):
        gm = next(g for g in GM_REGISTRY if g["slug"] == "morphy")
        assert seed_gm(gm, db) is True

        profile = db.query(GmProfile).filter_by(slug="morphy").first()
        assert profile is not None
        assert profile.display_name == "Paul Morphy"
        assert profile.games_analyzed > 0

    def test_seeding_is_idempotent(self, db):
        gm = next(g for g in GM_REGISTRY if g["slug"] == "tal")
        seed_gm(gm, db)
        seed_gm(gm, db)
        assert db.query(GmProfile).filter_by(slug="tal").count() == 1

    def test_all_registered_gms_seed(self, db):
        for gm in GM_REGISTRY:
            assert seed_gm(gm, db) is True, f"{gm['slug']} failed to seed"
        assert db.query(GmProfile).count() == len(GM_REGISTRY)

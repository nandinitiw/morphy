"""Unit tests for analysis/classifier.py — tactical motif detection on known positions."""
from analysis.classifier import classify_tactical_motif
from analysis.stockfish_worker import classify_move


class TestClassifyMove:
    def test_best(self):
        assert classify_move(0) == "best"
        assert classify_move(9) == "best"

    def test_good(self):
        assert classify_move(10) == "good"
        assert classify_move(24) == "good"

    def test_inaccuracy(self):
        assert classify_move(25) == "inaccuracy"
        assert classify_move(49) == "inaccuracy"

    def test_mistake(self):
        assert classify_move(50) == "mistake"
        assert classify_move(149) == "mistake"

    def test_blunder(self):
        assert classify_move(150) == "blunder"
        assert classify_move(900) == "blunder"

    def test_clamp_ceiling_is_still_a_blunder(self):
        # Mate positions score at ±10000; centipawn loss is clamped to this
        # ceiling so severities stay believable. The ceiling must still classify
        # as a blunder, and be a sane single-digit-pawns magnitude.
        from analysis.stockfish_worker import MAX_CENTIPAWN_LOSS
        assert classify_move(MAX_CENTIPAWN_LOSS) == "blunder"
        assert 300 <= MAX_CENTIPAWN_LOSS <= 2000


class TestClassifyTacticalMotif:
    def test_missed_mate(self):
        # Back-rank mate in one: Ra8#. Black king boxed in by own pawns.
        fen = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"
        motif = classify_tactical_motif(fen, move_played="g1h1", best_move="a1a8")
        assert motif == "missed_mate"

    def test_missed_check_simple(self):
        # Qe2-e8 gives a plain check to the black king on a8 (no mate, no discovery).
        fen = "k7/8/8/8/8/8/4Q3/4K3 w - - 0 1"
        motif = classify_tactical_motif(fen, move_played="e1d1", best_move="e2e8")
        assert motif in ("missed_check", "missed_mate")  # position-dependent, but must be check family

    def test_missed_knight_fork(self):
        # Knight on e5 hops to c6, forking king a7... craft simpler: Nd5-c7+ forks Ke8 and Ra8.
        fen = "r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1"
        motif = classify_tactical_motif(fen, move_played="e1d1", best_move="d5c7")
        # c7 is check AND fork; check is detected first in the classifier
        assert motif in ("missed_fork", "missed_check")

    def test_missed_hanging_piece(self):
        # Black queen on d5 is undefended; Qxd5 wins it (white queen d1).
        # Black king on h8, off the d5-a8 diagonal, so the capture is not check.
        fen = "7k/8/8/3q4/8/8/8/3QK3 w - - 0 1"
        motif = classify_tactical_motif(fen, move_played="e1e2", best_move="d1d5")
        assert motif == "missed_hanging_piece"

    def test_positional_catch_all(self):
        # Quiet pawn move as best; nothing tactical.
        fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        motif = classify_tactical_motif(fen, move_played="a2a3", best_move="e2e4")
        assert motif == "positional"

    def test_returns_string_or_none_never_raises(self):
        # Malformed-ish but legal inputs should not raise
        fen = "8/8/8/8/8/8/8/K6k w - - 0 1"
        result = classify_tactical_motif(fen, move_played="a1a2", best_move="a1b1")
        assert result is None or isinstance(result, str)

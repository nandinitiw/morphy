"""Tests for agent/tools.uci_to_san.

Moves are stored as UCI (what Stockfish emits) but the coach's replies are read
by chess players, who expect SAN. A regression here makes the AI say "you played
d8d7" instead of "you played Qd7".
"""
from agent.tools import uci_to_san

# Black to move; d8 queen, f8 rook.
BACK_RANK_FEN = "5rk1/pp3ppp/8/8/8/8/PP3PPP/3q1RK1 b - - 0 1"
# White to move; knight on d4.
KNIGHT_FEN = "1rb1k2r/2qnb1p1/p2p2p1/1p6/3N4/2N2Q2/PPP4P/2KR1B1R w k - 0 17"


class TestUciToSan:
    def test_knight_move(self):
        assert uci_to_san(KNIGHT_FEN, "d4b3") == "Nb3"
        assert uci_to_san(KNIGHT_FEN, "d4e6") == "Ne6"

    def test_disambiguates_when_needed(self):
        # Both knights (c3 and d4) can reach b5/e2-type squares; SAN must stay legal.
        san = uci_to_san(KNIGHT_FEN, "c3b5")
        assert san.startswith("N") and "b5" in san

    def test_capture_notation(self):
        san = uci_to_san(KNIGHT_FEN, "d4b5")
        assert "x" in san  # b5 is occupied by a black pawn

    def test_promotion(self):
        fen = "8/P6k/8/8/8/8/8/K7 w - - 0 1"
        assert uci_to_san(fen, "a7a8q") == "a8=Q"

    def test_illegal_move_falls_back_to_uci(self):
        assert uci_to_san(KNIGHT_FEN, "a1a8") == "a1a8"

    def test_garbage_falls_back(self):
        assert uci_to_san(KNIGHT_FEN, "zzzz") == "zzzz"

    def test_missing_fen_returns_uci(self):
        assert uci_to_san(None, "d4b3") == "d4b3"

    def test_missing_move(self):
        assert uci_to_san(KNIGHT_FEN, None) == "?"

    def test_check_suffix_preserved(self):
        san = uci_to_san(BACK_RANK_FEN, "d1f1")
        assert "x" in san  # queen takes the f1 rook

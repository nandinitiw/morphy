"""The 'left something else hanging' case, which used to fall through to positional."""
import chess

from analysis.classifier import classify_tactical_motif, drops_material_elsewhere

# White bishop on d5 is attacked by the rook on d8 and defended only by the
# knight on f4. Moving that knight decides whether the bishop survives.
ABANDONED_DEFENDER = "3r4/6k1/8/3B4/5N2/8/8/6K1 w - - 0 1"


def test_moving_the_only_defender_drops_material():
    board = chess.Board(ABANDONED_DEFENDER)
    # Nh3 stops defending d5, so the rook just takes the bishop.
    assert drops_material_elsewhere(board, chess.Move.from_uci("f4h3")) is True


def test_keeping_the_defender_does_not():
    board = chess.Board(ABANDONED_DEFENDER)
    # Ne3 also covers d5, so nothing is loose.
    assert drops_material_elsewhere(board, chess.Move.from_uci("f4e3")) is False


def test_classified_as_hung_piece_not_positional():
    motif = classify_tactical_motif(ABANDONED_DEFENDER, "f4h3", "f4e3")
    assert motif == "hangs_piece"


def test_square_the_move_landed_on_is_left_to_the_other_check():
    # A piece parked en prise is leaves_piece_hanging's job; this helper only
    # reports material loose *elsewhere*, so the two can't double-count.
    board = chess.Board("3r4/6k1/8/8/5N2/8/8/6K1 w - - 0 1")
    assert drops_material_elsewhere(board, chess.Move.from_uci("f4d5")) is False

"""Unit tests for ingestion/pgn_parser.py — the PGN → ParsedGame conversion layer."""
import pytest
from ingestion.pgn_parser import parse_pgn

SAMPLE_PGN = """[Event "Live Chess"]
[Site "Chess.com"]
[Date "2024.01.15"]
[White "alice"]
[Black "bob"]
[Result "1-0"]
[TimeControl "180+2"]
[ECO "B20"]
[ECOUrl "https://www.chess.com/openings/Sicilian-Defense"]
[Link "https://www.chess.com/game/live/123456789"]

1. e4 {[%clk 0:03:00]} c5 {[%clk 0:03:00]} 2. Nf3 {[%clk 0:02:58]} d6 {[%clk 0:02:59]} *
"""

DRAW_PGN = """[Event "Live Chess"]
[Site "Chess.com"]
[White "alice"]
[Black "bob"]
[Result "1/2-1/2"]
[TimeControl "600"]
[ECO "C50"]
[ECOUrl "https://www.chess.com/openings/Italian-Game"]
[Link "https://www.chess.com/game/live/999"]

1. e4 e5 2. Nf3 Nc6 *
"""


class TestParsePgn:
    def test_game_id_extracted_from_link(self):
        parsed = parse_pgn(SAMPLE_PGN, "alice")
        assert parsed.game_id == "123456789"

    def test_player_color_white(self):
        parsed = parse_pgn(SAMPLE_PGN, "alice")
        assert parsed.player_color == "white"

    def test_player_color_black(self):
        parsed = parse_pgn(SAMPLE_PGN, "bob")
        assert parsed.player_color == "black"

    def test_player_color_case_insensitive(self):
        parsed = parse_pgn(SAMPLE_PGN, "ALICE")
        assert parsed.player_color == "white"

    def test_result_stored_verbatim(self):
        parsed = parse_pgn(SAMPLE_PGN, "alice")
        assert parsed.result == "1-0"

    def test_draw_result(self):
        parsed = parse_pgn(DRAW_PGN, "alice")
        assert parsed.result == "1/2-1/2"

    def test_time_control_parsed(self):
        parsed = parse_pgn(SAMPLE_PGN, "alice")
        assert parsed.time_control == "180+2"

    def test_eco_code(self):
        parsed = parse_pgn(SAMPLE_PGN, "alice")
        assert parsed.eco == "B20"

    def test_opening_name_derived_from_eco_url(self):
        parsed = parse_pgn(SAMPLE_PGN, "alice")
        assert "Sicilian" in parsed.opening_name

    def test_positions_recorded(self):
        parsed = parse_pgn(SAMPLE_PGN, "alice")
        assert len(parsed.positions) > 0

    def test_positions_have_required_fields(self):
        parsed = parse_pgn(SAMPLE_PGN, "alice")
        pos = parsed.positions[0]
        assert "fen" in pos
        assert "move_played" in pos
        assert "move_number" in pos
        assert "is_white_turn" in pos

    def test_first_move_is_white_turn(self):
        parsed = parse_pgn(SAMPLE_PGN, "alice")
        assert parsed.positions[0]["is_white_turn"] is True

    def test_second_move_is_black_turn(self):
        parsed = parse_pgn(SAMPLE_PGN, "alice")
        assert parsed.positions[1]["is_white_turn"] is False

    def test_move_number_increments(self):
        parsed = parse_pgn(SAMPLE_PGN, "alice")
        move_numbers = [p["move_number"] for p in parsed.positions]
        assert move_numbers[0] == 1
        assert move_numbers[2] == 2

    def test_white_and_black_headers(self):
        parsed = parse_pgn(SAMPLE_PGN, "alice")
        assert parsed.white == "alice"
        assert parsed.black == "bob"

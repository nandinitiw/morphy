import chess
import chess.pgn
import io
from dataclasses import dataclass
@dataclass

class ParsedGame:
    game_id: str
    white: str
    black: str
    result: str          # "1-0", "0-1", "1/2-1/2"
    time_control: str
    eco: str             # Opening code e.g. "B20"
    opening_name: str
    positions: list[dict]  # List of {fen, move_played, clock_remaining, move_number}
    player_color: str    # "white" or "black" (relative to your username)

def parse_pgn(pgn_str: str, your_username: str) -> ParsedGame:
    game = chess.pgn.read_game(io.StringIO(pgn_str))
    headers = game.headers
    positions = []
    board = game.board()
    node = game
    while node.variations:
        next_node = node.variations[0]
        move = next_node.move
        clock = next_node.clock()  # Seconds remaining, if present
        positions.append({
            "fen": board.fen(),
            "move_played": move.uci(),
            "clock_remaining": clock,
            "move_number": board.fullmove_number,
            "is_white_turn": board.turn == chess.WHITE,
        })

        board.push(move)
        node = next_node
    player_color = "white" if headers.get("White", "").lower() == your_username.lower() else "black"
    return ParsedGame(
        game_id=headers.get("Link", "").split("/")[-1],
        white=headers.get("White", ""),
        black=headers.get("Black", ""),
        result=headers.get("Result", ""),
        time_control=headers.get("TimeControl", ""),
        eco=headers.get("ECO", ""),
        opening_name=headers.get("ECOUrl", "").split("/")[-1].replace("-", " "),
        positions=positions,
        player_color=player_color,
    )

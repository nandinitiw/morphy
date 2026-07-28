import chess

PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 100,
}


def classify_tactical_motif(fen: str, move_played: str, best_move: str) -> str | None:

    """
    Given a position where the player blundered, identify what tactical theme
    they missed. Returns a motif label or None if no clear theme.
    """

    board = chess.Board(fen)
    best = chess.Move.from_uci(best_move)
    played = chess.Move.from_uci(move_played)

    # Did best move deliver check?
    board_test = board.copy()
    board_test.push(best)

    if board_test.is_checkmate():
        return "missed_mate"

    if board_test.is_check():
        return detect_check_motif(board, best)

    if is_fork(board, best):
        return "missed_fork"

    if creates_pin(board, best):
        return "missed_pin"

    if creates_skewer(board, best):
        return "missed_skewer"

    if captures_hanging_piece(board, best):
        return "missed_hanging_piece"

    if is_king_safety_issue(board, played):
        return "king_safety"

    if is_back_rank_threat(board, best):
        return "missed_back_rank"

    # Not a missed tactic — look at what the *played* move did wrong. These
    # sub-types turn the old "positional" catch-all into something a player can
    # actually act on: did they hang a piece, lose a trade, or wreck their
    # pawn structure? Only when none of those fit is it a genuine slow /
    # positional error.
    if board.is_capture(played):
        if is_losing_trade(board, played):
            return "bad_trade"
    elif leaves_piece_hanging(board, played):
        return "hangs_piece"

    if creates_pawn_weakness(board, played):
        return "pawn_weakness"

    return "positional"  # Genuine slow error: no material or structural signal


def _min_attacker_value(board: chess.Board, color: chess.Color, square: chess.Square) -> int | None:
    """Value of the cheapest `color` piece attacking `square`, or None if none."""

    values = [
        PIECE_VALUES[board.piece_at(sq).piece_type]
        for sq in board.attackers(color, square)
    ]
    return min(values) if values else None


def _material_lost_on_square(
    board_after: chess.Board, square: chess.Square, owner: chess.Color, piece_value: int
) -> int:
    """Approximate material the `owner` loses on `square` to opponent captures.

    A lightweight static-exchange check: if the square is undefended the whole
    piece is lost; if the cheapest attacker is worth less than the piece, the
    owner loses the difference on the exchange; otherwise nothing.
    """

    min_attacker = _min_attacker_value(board_after, not owner, square)
    if min_attacker is None:
        return 0
    if not board_after.attackers(owner, square):
        return piece_value  # undefended — hangs outright
    if min_attacker < piece_value:
        return piece_value - min_attacker  # loses the exchange
    return 0


def leaves_piece_hanging(board: chess.Board, move: chess.Move) -> bool:
    """A quiet (non-capturing) move that parks a piece where the opponent wins material on it."""

    owner = board.turn
    after = board.copy()
    after.push(move)

    piece = after.piece_at(move.to_square)
    if not piece or piece.color != owner or piece.piece_type == chess.KING:
        return False

    value = PIECE_VALUES[piece.piece_type]
    return _material_lost_on_square(after, move.to_square, owner, value) > 0


def is_losing_trade(board: chess.Board, move: chess.Move) -> bool:
    """A capture that initiates an exchange netting material against the player."""

    owner = board.turn
    captured = board.piece_at(move.to_square)
    captured_value = PIECE_VALUES[captured.piece_type] if captured else 1  # en passant → pawn

    after = board.copy()
    after.push(move)

    piece = after.piece_at(move.to_square)
    if not piece or piece.piece_type == chess.KING:
        return False

    lost = _material_lost_on_square(after, move.to_square, owner, PIECE_VALUES[piece.piece_type])
    return lost > captured_value  # gave up more than the capture won


def _pawn_defect_count(board: chess.Board, color: chess.Color) -> int:
    """Count structural pawn defects (doubled files + isolated pawns) for `color`."""

    files = [chess.square_file(sq) for sq in board.pieces(chess.PAWN, color)]
    unique = set(files)
    doubled = sum(1 for f in unique if files.count(f) >= 2)
    isolated = sum(1 for f in files if f - 1 not in unique and f + 1 not in unique)
    return doubled + isolated


def creates_pawn_weakness(board: chess.Board, move: chess.Move) -> bool:
    """A pawn move that adds a new doubled or isolated pawn to the player's structure."""

    piece = board.piece_at(move.from_square)
    if not piece or piece.piece_type != chess.PAWN:
        return False

    owner = board.turn
    after = board.copy()
    after.push(move)
    return _pawn_defect_count(after, owner) > _pawn_defect_count(board, owner)


def is_fork(board: chess.Board, move: chess.Move) -> bool:
    """Check if a move attacks two or more pieces simultaneously."""

    board_copy = board.copy()
    board_copy.push(move)
    piece = board_copy.piece_at(move.to_square)

    if not piece:
        return False

    attacked_squares = board_copy.attacks(move.to_square)
    valuable_attacked = 0

    for sq in attacked_squares:
        target = board_copy.piece_at(sq)
        if target and target.color != piece.color:
            if target.piece_type in [chess.QUEEN, chess.ROOK, chess.KING]:
                valuable_attacked += 1

    return valuable_attacked >= 2

def is_back_rank_threat(board: chess.Board, move: chess.Move) -> bool:
    """Check if best move threatens a back-rank checkmate."""

    board_copy = board.copy()
    board_copy.push(move)
    opponent_color = not board.turn
    king_sq = board_copy.king(opponent_color)

    if not king_sq:
        return False

    back_rank = 7 if opponent_color == chess.WHITE else 0
    return chess.square_rank(king_sq) == back_rank


def creates_pin(board: chess.Board, move: chess.Move) -> bool:
    """Simplified pin detection — check if move places a slider behind a piece."""

    board_copy = board.copy()
    board_copy.push(move)

    # Check if any of your sliders (Q, R, B) now pin an opponent piece
    your_color = not board.turn  # After the move, it's opponent's turn

    for sq in chess.SQUARES:
        piece = board_copy.piece_at(sq)

        if piece and piece.color == your_color and piece.piece_type in [chess.QUEEN, chess.ROOK, chess.BISHOP]:

            if board_copy.is_pinned(not your_color, sq):
                return True

    return False


def detect_check_motif(board: chess.Board, move: chess.Move) -> str:
    """Sub-classify check-delivering moves."""

    board_copy = board.copy()
    board_copy.push(move)

    checkers = board_copy.checkers()
    checker_count = len(checkers)

    if checker_count >= 2:
        return "missed_double_check"

    if not board_copy.is_check():
        return "missed_check"

    # Discovered check: exactly one checker, and it isn't the piece that moved.
    if checker_count == 1 and move.to_square not in checkers:
        return "missed_discovered_check"

    return "missed_check"


def creates_skewer(board: chess.Board, move: chess.Move) -> bool:
    """Check if best move skewers a valuable piece with a higher-value piece behind it."""

    if board.is_capture(move):
        direction = _ray_direction(move.from_square, move.to_square)
        if direction is None:
            return False

        captured = board.piece_at(move.to_square)
        if not captured or captured.color == board.turn:
            return False
        if captured.piece_type not in [chess.QUEEN, chess.ROOK, chess.KING]:
            return False

        behind = _next_square_on_ray(move.to_square, direction)
        while behind is not None:
            behind_piece = board.piece_at(behind)
            if behind_piece:
                return (
                    behind_piece.color != board.turn
                    and behind_piece.piece_type in [chess.QUEEN, chess.KING]
                )
            behind = _next_square_on_ray(behind, direction)
        return False

    board_copy = board.copy()
    board_copy.push(move)
    your_color = board.turn
    opponent_color = not board.turn

    for sq in chess.SQUARES:
        piece = board_copy.piece_at(sq)
        if not piece or piece.color != your_color:
            continue
        if piece.piece_type not in [chess.QUEEN, chess.ROOK, chess.BISHOP]:
            continue

        for attacked_sq in board_copy.attacks(sq):
            target = board_copy.piece_at(attacked_sq)
            if not target or target.color != opponent_color:
                continue
            if target.piece_type not in [chess.QUEEN, chess.ROOK, chess.KING]:
                continue

            direction = _ray_direction(sq, attacked_sq)
            if direction is None:
                continue

            behind = _next_square_on_ray(attacked_sq, direction)
            while behind is not None:
                behind_piece = board_copy.piece_at(behind)
                if behind_piece:
                    if (
                        behind_piece.color == opponent_color
                        and behind_piece.piece_type in [chess.QUEEN, chess.KING]
                    ):
                        return True
                    break
                behind = _next_square_on_ray(behind, direction)

    return False


def captures_hanging_piece(board: chess.Board, move: chess.Move) -> bool:
    """Check if best move wins an undefended opponent piece."""

    if not board.is_capture(move):
        return False

    defenders = board.attackers(not board.turn, move.to_square)
    return len(defenders) == 0


def _ray_direction(from_sq: chess.Square, to_sq: chess.Square) -> tuple[int, int] | None:
    """Return (file_delta, rank_delta) step for a sliding attack, or None."""

    from_file, from_rank = chess.square_file(from_sq), chess.square_rank(from_sq)
    to_file, to_rank = chess.square_file(to_sq), chess.square_rank(to_sq)
    file_delta = to_file - from_file
    rank_delta = to_rank - from_rank

    if file_delta == 0 and rank_delta != 0:
        return (0, 1 if rank_delta > 0 else -1)
    if rank_delta == 0 and file_delta != 0:
        return (1 if file_delta > 0 else -1, 0)
    if abs(file_delta) == abs(rank_delta) and file_delta != 0:
        return (1 if file_delta > 0 else -1, 1 if rank_delta > 0 else -1)

    return None


def _next_square_on_ray(sq: chess.Square, direction: tuple[int, int]) -> chess.Square | None:
    file = chess.square_file(sq) + direction[0]
    rank = chess.square_rank(sq) + direction[1]
    if 0 <= file <= 7 and 0 <= rank <= 7:
        return chess.square(file, rank)
    return None

def is_king_safety_issue(board: chess.Board, move_played: chess.Move) -> bool:
    """Check if the move played left your king more exposed."""

    # Compare king safety score before/after
    # Simple heuristic: count attackers near king after move

    board_after = board.copy()
    board_after.push(move_played)
    your_king = board_after.king(board.turn)

    if not your_king:
        return False

    attacker_count = len(list(board_after.attackers(not board.turn, your_king)))
    return attacker_count >= 2

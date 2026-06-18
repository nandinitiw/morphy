"""
Compute 5 style axes from a PGN corpus for a named player.

Axes (all 0–100):
  development   – how fast minor pieces leave the back rank
  open_files    – how often rooks occupy open/semi-open files
  king_attack   – how often moves land near the opponent's king
  sacrifice_rate – % of captures where the attacker gives more material than they take
  aggression    – composite: pawn advances + pieces in enemy territory + sacrifices
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass, field

import chess
import chess.pgn

PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 0,
}

WHITE_MINOR_START = frozenset([chess.B1, chess.G1, chess.C1, chess.F1])
BLACK_MINOR_START = frozenset([chess.B8, chess.G8, chess.C8, chess.F8])


@dataclass
class _Accum:
    dev_moves: list[int] = field(default_factory=list)
    total_moves: int = 0
    captures: int = 0
    sacrifices: int = 0
    king_attack: int = 0
    rook_moves: int = 0
    rook_open_file: int = 0
    pawn_advances: int = 0
    enemy_half_moves: int = 0
    game_lengths: list[int] = field(default_factory=list)


def _is_open_file(board: chess.Board, file_idx: int) -> bool:
    for rank in range(8):
        sq = chess.square(file_idx, rank)
        p = board.piece_at(sq)
        if p and p.piece_type == chess.PAWN:
            return False
    return True


def _analyze_game(game: chess.pgn.Game, target_color: chess.Color, accum: _Accum) -> None:
    board = game.board()
    minor_developed: set[chess.Square] = set()
    minor_start = WHITE_MINOR_START if target_color == chess.WHITE else BLACK_MINOR_START
    dev_recorded = False
    ply = 0

    for node in game.mainline():
        move = node.move
        piece = board.piece_at(move.from_square)
        if piece is None:
            board.push(move)
            ply += 1
            continue

        is_target = piece.color == target_color

        if is_target:
            accum.total_moves += 1
            full_move = (ply // 2) + 1

            # Development: track when all 4 minor pieces first leave back rank
            if piece.piece_type in (chess.KNIGHT, chess.BISHOP):
                if move.from_square in minor_start:
                    minor_developed.add(move.from_square)
                    if len(minor_developed) == 4 and not dev_recorded:
                        accum.dev_moves.append(full_move)
                        dev_recorded = True

            # Sacrifice: attacker gives more than they take
            if board.is_capture(move):
                accum.captures += 1
                if board.is_en_passant(move):
                    captured_val = 1  # pawn
                else:
                    captured = board.piece_at(move.to_square)
                    captured_val = PIECE_VALUES.get(captured.piece_type, 0) if captured else 0
                moving_val = PIECE_VALUES.get(piece.piece_type, 0)
                if moving_val > captured_val + 1:
                    accum.sacrifices += 1

            # King attack: landing within a 5×5 zone around opponent's king
            opp_king = board.king(not target_color)
            if opp_king is not None:
                df = abs(chess.square_file(move.to_square) - chess.square_file(opp_king))
                dr = abs(chess.square_rank(move.to_square) - chess.square_rank(opp_king))
                if df <= 2 and dr <= 2:
                    accum.king_attack += 1

            # Rook on open file
            if piece.piece_type == chess.ROOK:
                accum.rook_moves += 1
                if _is_open_file(board, chess.square_file(move.to_square)):
                    accum.rook_open_file += 1

            # Pawn advances past 5th rank
            if piece.piece_type == chess.PAWN:
                to_rank = chess.square_rank(move.to_square)
                if target_color == chess.WHITE and to_rank >= 4:
                    accum.pawn_advances += 1
                elif target_color == chess.BLACK and to_rank <= 3:
                    accum.pawn_advances += 1

            # Pieces landing in enemy half
            to_rank = chess.square_rank(move.to_square)
            if target_color == chess.WHITE and to_rank >= 4:
                accum.enemy_half_moves += 1
            elif target_color == chess.BLACK and to_rank <= 3:
                accum.enemy_half_moves += 1

        board.push(move)
        ply += 1

    accum.game_lengths.append(ply // 2)


def _normalize(raw: float, lo: float, hi: float) -> float:
    """Map raw value linearly from [lo, hi] → [0, 100], clamped."""
    if hi == lo:
        return 50.0
    return max(0.0, min(100.0, (raw - lo) / (hi - lo) * 100))


def compute_style(pgn_text: str, player_name: str) -> dict:
    """
    Parse pgn_text and compute style axes for player_name.
    player_name is matched against White/Black PGN headers (case-insensitive substring).
    Returns a dict with axes + human-readable stats, or None if no matching games found.
    """
    accum = _Accum()
    pgn_io = io.StringIO(pgn_text)
    games_processed = 0

    while True:
        game = chess.pgn.read_game(pgn_io)
        if game is None:
            break

        white = game.headers.get("White", "")
        black = game.headers.get("Black", "")
        pname_lower = player_name.lower()

        if pname_lower in white.lower():
            target_color = chess.WHITE
        elif pname_lower in black.lower():
            target_color = chess.BLACK
        else:
            continue

        try:
            _analyze_game(game, target_color, accum)
            games_processed += 1
        except Exception:
            continue

    if games_processed == 0 or accum.total_moves == 0:
        return {}

    # Raw rates
    avg_dev_move  = sum(accum.dev_moves) / len(accum.dev_moves) if accum.dev_moves else 14.0
    sac_rate      = accum.sacrifices / max(accum.captures, 1)
    king_atk_rate = accum.king_attack / accum.total_moves
    open_file_rate = accum.rook_open_file / max(accum.rook_moves, 1)
    pawn_adv_rate  = accum.pawn_advances / accum.total_moves
    enemy_half_rate = accum.enemy_half_moves / accum.total_moves
    avg_game_len  = sum(accum.game_lengths) / len(accum.game_lengths)

    # Normalize to 0–100
    # Calibration notes:
    #   development:   avg_dev_move 4 → 100,  14 → 0
    #   open_files:    0% → 0,  50%+ → 100
    #   king_attack:   0% → 0,  20%+ → 100
    #   sacrifice_rate: 0% → 0, 7%+ → 100
    #   aggression:    composite of the above
    dev_score  = _normalize(avg_dev_move, hi=4.0, lo=14.0)   # inverted: lower move = higher score
    of_score   = _normalize(open_file_rate * 100, lo=0, hi=50)
    ka_score   = _normalize(king_atk_rate * 100, lo=0, hi=20)
    sac_score  = _normalize(sac_rate * 100, lo=0, hi=7)
    agg_score  = (ka_score * 0.4 + sac_score * 0.3 + _normalize(pawn_adv_rate * 100, lo=0, hi=15) * 0.3)

    return {
        "development":    round(dev_score, 1),
        "open_files":     round(of_score, 1),
        "king_attack":    round(ka_score, 1),
        "sacrifice_rate": round(sac_score, 1),
        "aggression":     round(agg_score, 1),
        "games_analyzed": games_processed,
        "avg_game_length": round(avg_game_len, 1),
        # Human-readable for comparison table
        "sacrifice_rate_pct":  f"{sac_rate * 100:.1f}%",
        "open_file_pct":       f"{open_file_rate * 100:.0f}%",
        "king_attack_pct":     f"{king_atk_rate * 100:.0f}%",
        "development_speed":   f"move {avg_dev_move:.1f}",
    }

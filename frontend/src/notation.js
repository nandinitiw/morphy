import { Chess } from "chess.js";

// Moves are stored as UCI ("d8d7") because that's what Stockfish and python-chess
// speak, but chess players read SAN ("Qd7"). Everything user-facing should show
// SAN — UCI in the UI reads as a bug to anyone who plays.

/**
 * Convert a UCI move to SAN in the context of `fen`.
 * Falls back to the raw UCI if the position or move can't be parsed, so a bad
 * record degrades to something readable rather than throwing.
 */
export function uciToSan(fen, uci) {
  if (!uci) return "—";
  if (!fen || uci.length < 4) return uci;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4].toLowerCase() : undefined,
    });
    return move?.san ?? uci;
  } catch {
    return uci; // illegal in this position (stale data) — show what we have
  }
}

/** Side to move for a FEN, as a board orientation. Defaults to white. */
export function sideToMove(fen) {
  try {
    return new Chess(fen).turn() === "w" ? "white" : "black";
  } catch {
    return "white";
  }
}

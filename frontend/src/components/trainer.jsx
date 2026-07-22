import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { fetchBlunderExamples, themeLabel } from "../api/client";

// Re-solve your own mistakes. Each card is a real position where you blundered;
// you try to find the move Stockfish preferred. This closes the loop from
// "here's what you got wrong" to actually practicing the fix — on your own games,
// not generic puzzles.

function squaresOf(uci) {
  if (!uci || uci.length < 4) return { from: null, to: null };
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export default function Trainer({ username, refreshKey = 0, tc = "all" }) {
  const [blunders, setBlunders] = useState(null);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [guess, setGuess] = useState(null); // { uci, correct } | null
  const [score, setScore] = useState({ correct: 0, done: 0 });
  const seen = useRef(new Set());

  useEffect(() => {
    setBlunders(null);
    setError(null);
    setIdx(0);
    setGuess(null);
    setScore({ correct: 0, done: 0 });
    seen.current = new Set();
    fetchBlunderExamples(username, tc)
      .then((list) => setBlunders((list || []).filter((b) => b.best_move && b.fen)))
      .catch((e) => setError(e));
  }, [username, refreshKey, tc]);

  const current = blunders && blunders[idx];

  const orientation = useMemo(() => {
    if (!current) return "white";
    try {
      return new Chess(current.fen).turn() === "w" ? "white" : "black";
    } catch {
      return "white";
    }
  }, [current]);

  const squareStyles = useMemo(() => {
    if (!guess || !current) return {};
    const styles = {};
    const best = squaresOf(current.best_move);
    if (guess.correct) {
      if (best.from) styles[best.from] = { background: "rgba(129,182,76,0.45)" };
      if (best.to) styles[best.to] = { background: "rgba(129,182,76,0.65)" };
    } else {
      const bad = squaresOf(guess.uci);
      if (bad.from) styles[bad.from] = { background: "rgba(224,82,82,0.4)" };
      if (bad.to) styles[bad.to] = { background: "rgba(224,82,82,0.55)" };
      if (best.from) styles[best.from] = { background: "rgba(129,182,76,0.4)" };
      if (best.to) styles[best.to] = { background: "rgba(129,182,76,0.6)" };
    }
    return styles;
  }, [guess, current]);

  function grade(uci) {
    if (guess || !current) return;
    const correct = uci === current.best_move;
    setGuess({ uci, correct });
    if (!seen.current.has(idx)) {
      seen.current.add(idx);
      setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), done: s.done + 1 }));
    }
  }

  function onDrop(from, to) {
    if (guess || !current) return false;
    let move;
    try {
      move = new Chess(current.fen).move({ from, to, promotion: "q" });
    } catch {
      move = null;
    }
    if (!move) return false; // illegal — snap back
    grade(move.from + move.to + (move.promotion || ""));
    return false; // keep the puzzle position; we reveal via highlights instead
  }

  function reveal() {
    if (!current) return;
    grade("__reveal__"); // never matches best_move → counts as not solved
  }

  function next() {
    setGuess(null);
    setIdx((i) => (blunders && i + 1 < blunders.length ? i + 1 : i));
  }

  if (error) return <div className="error">Failed to load trainer: {error.message}</div>;
  if (!blunders) return <div className="loading">Loading your positions…</div>;

  if (blunders.length === 0) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">Blunder trainer</div>
          <div className="page-sub">re-solve the positions you got wrong</div>
        </div>
        <div className="card">
          <div className="card-title">No positions to train yet</div>
          <p className="empty-copy">
            Analyze some games first — every blunder Stockfish finds becomes a puzzle here,
            so you can practice the fix on your own games.
          </p>
        </div>
      </div>
    );
  }

  const atEnd = idx + 1 >= blunders.length;
  const finished = guess && atEnd;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Blunder trainer</div>
          <div className="page-sub">
            Position {idx + 1} / {blunders.length} · re-solve the moves you got wrong
          </div>
        </div>
        <div className="trainer-score">
          {score.correct}/{score.done} solved
        </div>
      </div>

      <div className="card trainer-card">
        <div className="trainer-board">
          <Chessboard
            position={current.fen}
            boardWidth={340}
            boardOrientation={orientation}
            arePiecesDraggable={!guess}
            onPieceDrop={onDrop}
            customSquareStyles={squareStyles}
            customDarkSquareStyle={{ backgroundColor: "#b58863" }}
            customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
          />
        </div>

        <div className="trainer-side">
          <div className="trainer-eyebrow">
            {orientation === "white" ? "White" : "Black"} to move · {themeLabel(current.theme)}
          </div>

          {!guess ? (
            <>
              <p className="trainer-prompt">
                You played <span className="trainer-bad">{current.move_played}</span> here and lost{" "}
                <strong>{Math.round(current.centipawn_loss ?? 0)} cp</strong>. Find the move that
                keeps the advantage.
              </p>
              <button type="button" className="trainer-reveal-btn" onClick={reveal}>
                Show the answer
              </button>
            </>
          ) : (
            <>
              <div className={`trainer-verdict ${guess.correct ? "ok" : "no"}`}>
                {guess.correct ? "✓ Correct" : "✗ Not the top move"}
              </div>
              <p className="trainer-prompt">
                Best was <span className="trainer-good">{current.best_move}</span>
                {!guess.correct && guess.uci !== "__reveal__" && (
                  <>
                    {" "}— you tried <span className="trainer-bad">{guess.uci}</span>
                  </>
                )}
                . In the game you played <span className="trainer-bad">{current.move_played}</span>.
              </p>
              {finished ? (
                <div className="trainer-done">
                  Done — you solved <strong>{score.correct}</strong> of {score.done}.
                </div>
              ) : (
                <button type="button" className="trainer-next-btn" onClick={next}>
                  Next position →
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { fetchBlunderExamples, themeLabel } from "../api/client";
import { uciToSan } from "../notation.js";

// Re-solve your own mistakes. Each card is a real position where you blundered;
// you try to find the move Stockfish preferred. This closes the loop from
// "here's what you got wrong" to actually practicing the fix — on your own games,
// not generic puzzles.

const REVEAL = "__reveal__";

function squaresOf(uci) {
  if (!uci || uci.length < 4) return { from: null, to: null };
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export default function Trainer({ username, refreshKey = 0, tc = "all", themeFilter = null }) {
  const [allBlunders, setAllBlunders] = useState(null);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [guess, setGuess] = useState(null); // { uci, correct } | null
  const [score, setScore] = useState({ correct: 0, done: 0 });
  const [activeTheme, setActiveTheme] = useState(themeFilter);
  const seen = useRef(new Set());

  // When the coach hands off a specific theme, focus the deck on it.
  useEffect(() => {
    setActiveTheme(themeFilter);
  }, [themeFilter, refreshKey]);

  useEffect(() => {
    setAllBlunders(null);
    setError(null);
    // Pull a deep set (up to 20 per theme) so a themed drill has real material,
    // not just the 3 dashboard examples.
    fetchBlunderExamples(username, tc, { limit: 20 })
      .then((list) => setAllBlunders((list || []).filter((b) => b.best_move && b.fen)))
      .catch((e) => setError(e));
  }, [username, refreshKey, tc]);

  // Distinct themes present, for the self-filter dropdown.
  const themes = useMemo(() => {
    if (!allBlunders) return [];
    return [...new Set(allBlunders.map((b) => b.theme))];
  }, [allBlunders]);

  const blunders = useMemo(() => {
    if (!allBlunders) return null;
    return activeTheme ? allBlunders.filter((b) => b.theme === activeTheme) : allBlunders;
  }, [allBlunders, activeTheme]);

  // Reset the run whenever the active deck changes (theme switch or refetch).
  useEffect(() => {
    setIdx(0);
    setGuess(null);
    setScore({ correct: 0, done: 0 });
    seen.current = new Set();
  }, [activeTheme, allBlunders]);

  const current = blunders && blunders[idx];

  const orientation = useMemo(() => {
    if (!current) return "white";
    try {
      return new Chess(current.fen).turn() === "w" ? "white" : "black";
    } catch {
      return "white";
    }
  }, [current]);

  // Display SAN, not the UCI we store — "Qd7" not "d8d7".
  const playedSan = useMemo(
    () => (current ? uciToSan(current.fen, current.move_played) : "—"),
    [current],
  );
  const bestSan = useMemo(
    () => (current ? uciToSan(current.fen, current.best_move) : "—"),
    [current],
  );
  const guessSan = useMemo(
    () => (current && guess && guess.uci !== REVEAL ? uciToSan(current.fen, guess.uci) : null),
    [current, guess],
  );

  const squareStyles = useMemo(() => {
    if (!guess || !current) return {};
    const styles = {};
    const best = squaresOf(current.best_move);
    if (guess.correct) {
      if (best.from) styles[best.from] = { background: "var(--sq-target)" };
      if (best.to) styles[best.to] = { background: "var(--sq-target)" };
    } else {
      // On "show the answer" there is no attempted move to highlight.
      const bad = guess.uci === REVEAL ? { from: null, to: null } : squaresOf(guess.uci);
      if (bad.from) styles[bad.from] = { background: "var(--sq-from)" };
      if (bad.to) styles[bad.to] = { background: "var(--sq-from)" };
      if (best.from) styles[best.from] = { background: "var(--sq-target)" };
      if (best.to) styles[best.to] = { background: "var(--sq-target)" };
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
    grade(REVEAL); // never matches best_move → counts as not solved
  }

  function next() {
    setGuess(null);
    setIdx((i) => (blunders && i + 1 < blunders.length ? i + 1 : i));
  }

  const themeSelector = themes.length > 1 && (
    <select
      className="trainer-theme-select"
      value={activeTheme ?? ""}
      onChange={(e) => setActiveTheme(e.target.value || null)}
      aria-label="Filter positions by theme"
    >
      <option value="">All themes</option>
      {themes.map((t) => (
        <option key={t} value={t}>
          {themeLabel(t)}
        </option>
      ))}
    </select>
  );

  if (error) return <div className="error">Failed to load trainer: {error.message}</div>;
  if (!blunders) return <div className="loading">Loading your positions…</div>;

  if (blunders.length === 0) {
    const filtered = activeTheme && allBlunders && allBlunders.length > 0;
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">Blunder trainer</div>
          <div className="page-sub">re-solve the positions you got wrong</div>
        </div>
        <div className="card">
          <div className="card-title">
            {filtered ? `No ${themeLabel(activeTheme)} positions to drill` : "No positions to train yet"}
          </div>
          <p className="empty-copy">
            {filtered ? (
              <>You have no blunders tagged “{themeLabel(activeTheme)}”.{" "}
                <button type="button" className="trainer-link-btn" onClick={() => setActiveTheme(null)}>
                  Show all positions
                </button>
              </>
            ) : (
              "Analyze some games first — every blunder Stockfish finds becomes a puzzle here, so you can practice the fix on your own games."
            )}
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
          <div className="page-title">
            {activeTheme ? `Drilling: ${themeLabel(activeTheme)}` : "Blunder trainer"}
          </div>
          <div className="page-sub">
            Position {idx + 1} / {blunders.length} ·{" "}
            {activeTheme ? "your own positions in this theme" : "re-solve the moves you got wrong"}
          </div>
        </div>
        <div className="trainer-header-controls">
          {themeSelector}
          <div className="trainer-score">
            {score.correct}/{score.done} solved
          </div>
        </div>
      </div>

      <div className="card trainer-card">
        <div className="trainer-board">
          <Chessboard
            position={current.fen}
            boardWidth={400}
            boardOrientation={orientation}
            arePiecesDraggable={!guess}
            onPieceDrop={onDrop}
            customSquareStyles={squareStyles}
            customDarkSquareStyle={{ backgroundColor: "#A9754F" }}
            customLightSquareStyle={{ backgroundColor: "#EFE6D3" }}
          />
          {guess?.correct && (
            <div className="stamp-overlay">
              <div className="stamp">
                <div className="stamp-check">✓</div>
                <div className="stamp-label">Correct</div>
              </div>
            </div>
          )}
        </div>

        <div className="trainer-side">
          <div className="trainer-eyebrow">
            {orientation === "white" ? "White" : "Black"} to move · {themeLabel(current.theme)}
          </div>

          {!guess ? (
            <>
              <p className="trainer-prompt">
                You played <span className="trainer-bad">{playedSan}</span> here and lost{" "}
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
                Best was <span className="trainer-good">{bestSan}</span>
                {!guess.correct && guess.uci !== REVEAL && (
                  <>
                    {" "}— you tried <span className="trainer-bad">{guessSan}</span>
                  </>
                )}
                . In the game you played <span className="trainer-bad">{playedSan}</span>.
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

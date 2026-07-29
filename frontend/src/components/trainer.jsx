import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { fetchBlunderExamples, fetchDrillQueue, fetchMastery, recordDrillAttempt, themeLabel } from "../api/client";
import { uciToSan } from "../notation.js";

// Re-solve your own mistakes. Each card is a real position where you blundered;
// you try to find the move Stockfish preferred. For real users this runs on
// spaced repetition — positions you fail resurface until they stick, positions
// you master are pushed out. The demo has no backend, so it stays a simple
// in-session run over the pre-seeded snapshot.

const REVEAL = "__reveal__";

function squaresOf(uci) {
  if (!uci || uci.length < 4) return { from: null, to: null };
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

// Human-friendly "when does this come back" from an ISO next_due timestamp.
function formatNextDue(iso) {
  if (!iso) return null;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "later this session";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export default function Trainer({ username, refreshKey = 0, tc = "all", themeFilter = null, onAskCoach }) {
  const isDemo = username === "demo";
  const [deck, setDeck] = useState(null);
  const [masteryThemes, setMasteryThemes] = useState([]);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [guess, setGuess] = useState(null); // { uci, correct } | null
  const [score, setScore] = useState({ correct: 0, done: 0 });
  const [attemptResult, setAttemptResult] = useState(null); // server card state after grading
  const [activeTheme, setActiveTheme] = useState(themeFilter);
  const seen = useRef(new Set());

  // When the coach hands off a specific theme, focus the deck on it.
  useEffect(() => {
    setActiveTheme(themeFilter);
  }, [themeFilter, refreshKey]);

  // Theme universe for the dropdown. Real users get every theme they have
  // material in (from mastery, so fully-mastered themes still show); the demo
  // derives it from the snapshot deck.
  useEffect(() => {
    if (isDemo) return;
    fetchMastery(username)
      .then((m) => setMasteryThemes(m.filter((x) => x.total_positions > 0).map((x) => x.theme)))
      .catch(() => {});
  }, [username, refreshKey, isDemo]);

  // Load the deck. Real users pull the spaced-repetition queue (due reviews
  // first, then new material), theme-scoped server-side. The demo pulls its
  // static blunder snapshot and filters client-side.
  useEffect(() => {
    setDeck(null);
    setError(null);
    const load = isDemo
      ? fetchBlunderExamples(username, tc, { limit: 20 }).then((list) =>
          (list || []).filter((b) => b.best_move && b.fen),
        )
      : fetchDrillQueue(username, { theme: activeTheme || undefined, limit: 20 });
    load.then(setDeck).catch((e) => setError(e));
  }, [username, refreshKey, tc, isDemo, activeTheme]);

  const themes = useMemo(() => {
    if (isDemo) return deck ? [...new Set(deck.map((b) => b.theme))] : [];
    return masteryThemes;
  }, [isDemo, deck, masteryThemes]);

  // Real-user decks are already theme-scoped by the server; the demo filters here.
  const blunders = useMemo(() => {
    if (!deck) return null;
    if (isDemo && activeTheme) return deck.filter((b) => b.theme === activeTheme);
    return deck;
  }, [deck, activeTheme, isDemo]);

  // Reset the run whenever the active deck changes (theme switch or refetch).
  useEffect(() => {
    setIdx(0);
    setGuess(null);
    setScore({ correct: 0, done: 0 });
    setAttemptResult(null);
    seen.current = new Set();
  }, [activeTheme, deck]);

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
    const key = current.position_id ?? idx;
    if (!seen.current.has(key)) {
      seen.current.add(key);
      setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), done: s.done + 1 }));
    }
    // Persist the attempt so spaced repetition can reschedule it (real users only;
    // the demo has no backend). A revealed answer counts as a failed review.
    if (!isDemo && current.position_id != null) {
      setAttemptResult(null);
      recordDrillAttempt(username, current.position_id, correct)
        .then(setAttemptResult)
        .catch(() => {});
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
    setAttemptResult(null);
    setIdx((i) => (blunders && i + 1 < blunders.length ? i + 1 : i));
  }

  // Hand this exact position into a grounded coach conversation. The prompt is
  // self-contained (FEN + both moves) so the coach can render the board and
  // explain the mistake against the user's real game.
  function askCoach() {
    if (!current || !onAskCoach) return;
    const cp = Math.round(current.centipawn_loss ?? 0);
    onAskCoach(
      `Look at this position from one of my games (theme: ${themeLabel(current.theme)}` +
        `${current.move_number ? `, move ${current.move_number}` : ""}). ` +
        `FEN: ${current.fen}. I played ${playedSan} and lost about ${cp} centipawns; ` +
        `the engine preferred ${bestSan}. Explain why ${bestSan} is better and what I ` +
        `should have been looking for. Show the position on a board.`,
    );
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
    const filtered = activeTheme && themes.length > 0;
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">Blunder trainer</div>
          <div className="page-sub">re-solve the positions you got wrong</div>
        </div>
        <div className="card">
          <div className="card-title">
            {filtered
              ? `No ${themeLabel(activeTheme)} positions due right now`
              : "No positions to train yet"}
          </div>
          <p className="empty-copy">
            {filtered ? (
              <>
                {isDemo
                  ? `No blunders tagged “${themeLabel(activeTheme)}”.`
                  : `You're caught up on “${themeLabel(activeTheme)}” — nothing is due for review.`}{" "}
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
            {current.is_review && (
              <span className="trainer-review-badge">
                Review{current.times_seen ? ` · seen ${current.times_seen}×` : ""}
              </span>
            )}
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
              {attemptResult && (
                <div className={`trainer-schedule ${attemptResult.mastered ? "mastered" : ""}`}>
                  {attemptResult.mastered ? (
                    <>★ Mastered — you&rsquo;ve got this one down.</>
                  ) : (
                    <>
                      {guess.correct ? "Nice — back for review " : "You'll see this again "}
                      <strong>{formatNextDue(attemptResult.next_due_at) ?? "soon"}</strong>.
                    </>
                  )}
                </div>
              )}
              <div className="trainer-actions">
                {onAskCoach && (
                  <button type="button" className="trainer-ask-coach-btn" onClick={askCoach}>
                    <i className="ti ti-message-chatbot" aria-hidden="true" /> Ask the coach why
                  </button>
                )}
                {finished ? (
                  <div className="trainer-done">
                    Done — you solved <strong>{score.correct}</strong> of {score.done}.
                  </div>
                ) : (
                  <button type="button" className="trainer-next-btn" onClick={next}>
                    Next position →
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

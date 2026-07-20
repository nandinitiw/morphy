import { useEffect, useState } from "react";

import { checkBackendHealth, getApiBase } from "../api/client.js";
import { useUsername } from "../context/UsernameContext.jsx";
import { useIngest } from "../context/IngestContext.jsx";
import { useElapsedSeconds, formatDuration } from "../hooks/useElapsedSeconds.js";

export default function UsernameSetup() {
  const { setUsername, normalizeUsername } = useUsername();
  const { startIngest, job, error: ingestError, isRunning, startedAt } = useIngest();
  const [input, setInput] = useState("");
  const [validationError, setValidationError] = useState("");
  const [backendOk, setBackendOk] = useState(null);
  const elapsed = useElapsedSeconds(startedAt, isRunning);

  useEffect(() => {
    checkBackendHealth()
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const normalized = normalizeUsername(input);
    if (normalized.length < 3) {
      setValidationError("Enter a valid Chess.com username (at least 3 characters).");
      return;
    }
    setValidationError("");
    // Stay on this screen while analysis runs so the progress + live counter are
    // visible, then enter the app once it actually finishes. On failure/lost the
    // error shows here and the user can retry without landing in an empty app.
    try {
      const finalJob = await startIngest(normalized);
      if (finalJob?.status === "completed") {
        setUsername(normalized);
      }
    } catch {
      // error surfaced via ingestError below
    }
  }

  function handleDemo() {
    setUsername("demo");
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-logo">Morphy</div>
        <p className="setup-tagline">Your chess coach agent</p>

        <form className="setup-form" onSubmit={handleSubmit}>
          <label className="setup-label" htmlFor="chess-username">
            Chess.com username
          </label>
          <input
            id="chess-username"
            className="setup-input"
            type="text"
            placeholder="e.g. hikaru"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="username"
            autoFocus
            disabled={isRunning}
          />
          {(validationError || ingestError) && (
            <p className="setup-error">{validationError || ingestError}</p>
          )}
          <button className="setup-btn" type="submit" disabled={isRunning || !input.trim()}>
            {isRunning ? "Analyzing your games…" : "Analyze my games"}
          </button>
        </form>

        <div className="setup-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="setup-btn setup-btn-demo"
          onClick={handleDemo}
          disabled={isRunning}
        >
          Try demo
        </button>
        <p className="setup-demo-note">
          Explore with pre-loaded games — no Chess.com account needed.
        </p>

        {job && (
          <div className="setup-progress">
            <div className="setup-progress-status">
              Status: <strong>{job.status}</strong>
              {isRunning && <span className="setup-elapsed"> · {formatDuration(elapsed)} elapsed</span>}
            </div>
            {job.status === "ingesting" && (
              <p className="setup-progress-detail">Fetching your games from Chess.com…</p>
            )}
            {job.status === "analyzing" && (
              <p className="setup-progress-detail">
                {job.games_analyzed === 0
                  ? "Starting the Stockfish engine and analyzing your first game…"
                  : `Analyzed ${job.games_analyzed} / ${job.games_total} games`}
              </p>
            )}
            {job.status === "profiling" && (
              <p className="setup-progress-detail">Building your weakness profile…</p>
            )}
            {job.status === "completed" && (
              <p className="setup-progress-detail setup-success">
                Done — {job.games_analyzed} games analyzed, {job.weakness_themes} weakness themes found.
              </p>
            )}
            {job.status === "failed" && (
              <p className="setup-progress-detail setup-error">{job.error}</p>
            )}
            {isRunning && (job.status === "analyzing" || job.status === "ingesting") && (
              <p className="setup-progress-hint">
                Stockfish analyzes about one game per minute on the free server, so this
                takes a few minutes. Keep this tab open — it&rsquo;s working.
              </p>
            )}
          </div>
        )}

        <p className="setup-footnote">
          We pull your public Chess.com games and run Stockfish analysis to find tactical blind spots.
        </p>

        {backendOk === false && (
          <div className="setup-backend-warning">
            <strong>Backend not reachable</strong> at {getApiBase()}
            <br />
            Run locally: <code>cd backend && uvicorn main:app --reload --port 8000</code>
            <br />
            On Vercel: set <code>VITE_API_URL</code> to your hosted backend URL and redeploy.
          </div>
        )}
        {backendOk === true && (
          <p className="setup-backend-ok">Connected to backend</p>
        )}
      </div>
    </div>
  );
}

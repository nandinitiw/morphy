import { useEffect, useState } from "react";

import {
  checkBackendHealth,
  getApiBase,
  fetchWeaknessProfile,
  fetchOpeningStats,
  fetchBlunderExamples,
  fetchStyleGap,
} from "../api/client.js";
import { useUsername } from "../context/UsernameContext.jsx";
import { useIngest } from "../context/IngestContext.jsx";
import { useElapsedSeconds, formatDuration } from "../hooks/useElapsedSeconds.js";

// The demo has no analysis to run — its games are pre-seeded — so the only thing
// that can make it slow is a free-tier cold start (~30-60s to wake a spun-down
// instance). We preload every demo view in parallel to warm the instance, and
// show a live timer so it's obviously working rather than frozen.
function demoMessage(sec) {
  if (sec < 4) return "Loading pre-analyzed demo games…";
  if (sec < 10) return "Waking the demo server…";
  if (sec < 22) return "Almost there — the free server is starting up…";
  return "Still starting — free-tier cold start can take up to a minute…";
}

export default function UsernameSetup() {
  const { setUsername, normalizeUsername } = useUsername();
  const { startIngest, job, error: ingestError, isRunning, startedAt } = useIngest();
  const [input, setInput] = useState("");
  const [validationError, setValidationError] = useState("");
  const [backendOk, setBackendOk] = useState(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoStartedAt, setDemoStartedAt] = useState(null);
  const [demoError, setDemoError] = useState("");
  const elapsed = useElapsedSeconds(startedAt, isRunning);
  const demoElapsed = useElapsedSeconds(demoStartedAt, demoLoading);

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

  async function handleDemo() {
    setDemoError("");
    setDemoStartedAt(Date.now());
    setDemoLoading(true);
    try {
      // Preload every demo view in parallel — this both warms the instance and
      // confirms the data is ready before we drop the recruiter into the app,
      // so navigating between pages is instant afterwards.
      const [profile] = await Promise.all([
        fetchWeaknessProfile("demo"),
        fetchOpeningStats("demo").catch(() => null),
        fetchBlunderExamples("demo").catch(() => null),
        fetchStyleGap("demo", "morphy").catch(() => null),
      ]);
      if (!profile) throw new Error("Demo data unavailable");
      setUsername("demo");
    } catch (err) {
      setDemoError(err?.message ?? "Could not load the demo. Please retry.");
      setDemoLoading(false);
    }
  }

  if (demoLoading) {
    return (
      <div className="setup-screen">
        <div className="setup-card demo-loading-card">
          <div className="setup-logo">Morphy</div>
          <div className="demo-spinner" aria-hidden="true" />
          <div className="demo-timer">{demoElapsed}s</div>
          <p className="demo-loading-msg">{demoMessage(demoElapsed)}</p>
          <p className="setup-demo-note">Loading the pre-analyzed demo — no account needed.</p>
        </div>
      </div>
    );
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
        {demoError && <p className="setup-error">{demoError}</p>}

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

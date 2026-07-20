import { useState } from "react";
import { useIngest } from "../context/IngestContext.jsx";
import { useElapsedSeconds, formatDuration } from "../hooks/useElapsedSeconds.js";

const STEPS = ["pending", "ingesting", "analyzing", "profiling", "completed"];

const STATUS_LABELS = {
  pending: "Queued",
  ingesting: "Fetching games from Chess.com",
  analyzing: "Running Stockfish analysis",
  profiling: "Building weakness profile",
  completed: "Analysis complete",
  failed: "Analysis failed",
};

function ProgressBar({ status }) {
  const idx = STEPS.indexOf(status);
  const pct = idx < 0 ? 0 : Math.round(((idx + 1) / STEPS.length) * 100);
  const done = status === "completed";
  const failed = status === "failed";
  return (
    <div className="ingest-progress-track">
      <div
        className={`ingest-progress-fill ${done ? "ingest-progress-done" : ""} ${failed ? "ingest-progress-fail" : ""}`}
        style={{ width: failed ? "100%" : `${pct}%` }}
      />
    </div>
  );
}

export default function IngestBanner({ username, onComplete }) {
  const { job, error, isRunning, startedAt, startIngest } = useIngest();
  const [dismissed, setDismissed] = useState(false);
  const elapsed = useElapsedSeconds(startedAt, isRunning);

  if (username === "demo") {
    if (dismissed) return null;
    return (
      <div className="ingest-banner ingest-banner-demo">
        <div className="ingest-banner-text">
          <strong>Demo mode</strong> — pre-loaded with 30 rapid games and 6 weakness themes.
          Enter your Chess.com username on the home screen to analyze your own games.
        </div>
        <button
          type="button"
          className="ingest-banner-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss demo banner"
        >
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      </div>
    );
  }

  async function handleRefresh() {
    try {
      const finalJob = await startIngest(username);
      if (finalJob?.status === "completed") {
        onComplete?.();
      }
    } catch {
      // error surfaced via context
    }
  }

  if (!job && !isRunning && !error) {
    return (
      <div className="ingest-banner">
        <div className="ingest-banner-text">
          Analyzing <strong>{username}</strong> on Chess.com
        </div>
        <button type="button" className="ingest-banner-btn" onClick={handleRefresh}>
          Refresh games
        </button>
      </div>
    );
  }

  const isFailed = job?.status === "failed";
  const isDone = job?.status === "completed";

  // Once analysis completes, collapse to a thin one-line strip — the banner
  // shouldn't keep eating vertical space on every page after the work is done.
  if (isDone) {
    return (
      <div className="ingest-banner ingest-banner-compact">
        <div className="ingest-banner-text">
          <i className="ti ti-circle-check" aria-hidden="true" style={{ marginRight: 6 }} />
          {job.games_analyzed} games analyzed · {job.weakness_themes} themes
        </div>
        <button type="button" className="ingest-banner-btn" onClick={handleRefresh}>
          Refresh games
        </button>
      </div>
    );
  }

  return (
    <div className={`ingest-banner ${isFailed ? "ingest-banner-error" : ""}`}>
      <div className="ingest-banner-body">
        <div className="ingest-banner-text">
          {isRunning || job ? (
            <>
              <strong>{STATUS_LABELS[job?.status] ?? "Working…"}</strong>
              {job?.status === "analyzing" && (
                <span className="ingest-banner-detail">
                  {job.games_analyzed === 0
                    ? " — starting engine…"
                    : ` — ${job.games_analyzed} / ${job.games_total} games`}
                </span>
              )}
              {job?.status === "ingesting" && job.games_ingested > 0 && (
                <span className="ingest-banner-detail"> — {job.games_ingested} new games found</span>
              )}
              {isRunning && <span className="ingest-banner-detail"> · {formatDuration(elapsed)}</span>}
              {(error || job?.error) && (
                <span className="ingest-banner-detail ingest-error"> — {error || job.error}</span>
              )}
            </>
          ) : null}
        </div>
        {(isRunning || job) && !isFailed && (
          <ProgressBar status={job?.status ?? "pending"} />
        )}
        {isRunning && (job?.status === "analyzing" || job?.status === "ingesting") && (
          <div className="ingest-banner-hint">
            ~1 min per game on the free server — keep this tab open while it works.
          </div>
        )}
      </div>
      {!isRunning && (
        <button type="button" className="ingest-banner-btn" onClick={handleRefresh}>
          {isFailed ? "Retry" : "Refresh games"}
        </button>
      )}
    </div>
  );
}

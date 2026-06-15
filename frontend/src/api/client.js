// All backend API calls live here.
// Set VITE_API_URL in your .env file: VITE_API_URL=http://localhost:8000

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

// ── Profile & stats ──────────────────────────────────────────────────────────

/** Returns { win_rate, avg_accuracy, blunder_rate, games_analyzed, accuracy_trend } */
export const fetchProfile = (username) => get(`/profile/${username}`);

/** Returns { weaknesses: [{ theme, frequency, severity, last_seen }] } */
export const fetchWeaknessProfile = (username) => get(`/profile/${username}/weaknesses`);

/** Returns { time_buckets: { "0-15s": 0.29, ... }, critical_threshold_seconds: 22, insight: "..." } */
export const fetchTimePressure = (username) => get(`/profile/${username}/time-pressure`);

// ── Openings ─────────────────────────────────────────────────────────────────

/** Returns { openings: [{ eco, name, games, win_rate, draw_rate, loss_rate, avg_accuracy }] } */
export const fetchOpeningStats = (username) => get(`/openings/${username}`);

// ── Style gap ─────────────────────────────────────────────────────────────────

/**
 * Returns {
 *   you: { development, open_files, king_attack, sacrifice_rate, aggression },
 *   morphy: { ... same keys ... },
 *   summary: "..."
 * }
 */
export const fetchStyleGap = (username, gmUsername = "paulmorphy") =>
  get(`/style-gap/${username}?gm=${gmUsername}`);

// ── Coach agent ───────────────────────────────────────────────────────────────

/**
 * Sends a message to the coach agent.
 * Returns { response: "..." }
 * The agent will call tools server-side before replying.
 */
export const sendCoachMessage = (username, message) =>
  post(`/coach`, { username, message });

// ── Ingestion ─────────────────────────────────────────────────────────────────

/** Triggers a fresh ingestion + analysis run. Returns { job_id, status } */
export const triggerIngest = (username) =>
  post(`/ingest/${username}`, {});

/** Polls the status of an ingestion job. Returns { status, games_processed, games_total } */
export const fetchIngestStatus = (jobId) => get(`/jobs/${jobId}`);
// All backend API calls live here.
//
// Local dev: leave VITE_API_URL empty — Vite proxies to localhost:8000 (see vite.config.js)
// Production (Vercel): set VITE_API_URL to your hosted backend, e.g. https://morphy-api.onrender.com

import DEMO_SNAPSHOT from "../demo/snapshot.json";

const BASE = import.meta.env.VITE_API_URL ?? "";

export function getApiBase() {
  return BASE || window.location.origin;
}

// The demo user's data is static (pre-seeded fixtures), so we bundle a snapshot
// of every demo read-endpoint and serve it locally. This makes the demo load
// instantly and work even when the free-tier backend is cold or asleep — only
// the live AI coach still needs the server. Regenerate after changing demo data:
//   see scripts/snapshot_demo.py (curls the backend into src/demo/snapshot.json)
// Any path not in the snapshot falls through to a real request, so partial
// coverage degrades gracefully rather than breaking.
function demoSnapshot(path) {
  if (Object.prototype.hasOwnProperty.call(DEMO_SNAPSHOT, path)) {
    return structuredClone(DEMO_SNAPSHOT[path]);
  }
  // `limit` and `theme` only cap/narrow results; the demo dataset is small and
  // the Trainer filters by theme client-side, so drop them and reuse the base
  // (or tc-filtered) snapshot rather than falling through to a live request.
  const stripped = path
    .replace(/([?&])limit=[^&]*/g, "$1")
    .replace(/([?&])theme=[^&]*/g, "$1")
    .replace(/[?&]+$/g, "")
    .replace(/\?&/, "?")
    .replace(/&&+/g, "&");
  if (stripped !== path && Object.prototype.hasOwnProperty.call(DEMO_SNAPSHOT, stripped)) {
    return structuredClone(DEMO_SNAPSHOT[stripped]);
  }
  return undefined;
}

const THEME_LABELS = {
  missed_fork: "Missed fork",
  missed_pin: "Missed pin",
  missed_skewer: "Missed skewer",
  missed_mate: "Missed mate",
  missed_check: "Missed check",
  missed_discovered_check: "Missed discovered check",
  missed_double_check: "Missed double check",
  missed_hanging_piece: "Missed hanging piece",
  missed_back_rank: "Back rank",
  king_safety: "King safety",
  hangs_piece: "Hung piece",
  bad_trade: "Bad trade",
  pawn_weakness: "Pawn weakness",
  positional: "Positional play",
};

const THEME_DESCRIPTIONS = {
  missed_fork: "You missed a move that attacks two or more valuable pieces at once.",
  missed_pin: "A piece was pinned to a more valuable piece behind it, and you didn't exploit or defend it.",
  missed_skewer: "You missed a line where a valuable piece is attacked and must move, exposing another piece.",
  missed_mate: "A forced checkmate was available and you played something else.",
  missed_check: "You overlooked a strong checking move that wins material or creates a decisive threat.",
  missed_discovered_check: "Moving one piece could have unveiled an attack from another, with check.",
  missed_double_check: "Two pieces could have checked the king simultaneously, which is almost always devastating.",
  missed_hanging_piece: "An undefended piece was there for the taking.",
  missed_back_rank: "Your king was trapped on the back rank with a mating threat you missed.",
  king_safety: "You left your king exposed: loose pawns, open files, or delayed castling.",
  hangs_piece: "You moved a piece to a square where your opponent could win it, undefended or defended too cheaply. Scan what your opponent can capture before you commit.",
  bad_trade: "You entered an exchange that lost material, giving up more than you got back. Count the value on both sides before you capture.",
  pawn_weakness: "Your move damaged your own pawn structure, creating a doubled or isolated pawn that becomes a long-term target.",
  positional: "A genuine slow error with no material or structural signal, but Stockfish found a clearly better plan: a stronger square, a more active piece, or a better pawn break you overlooked.",
};

export function themeLabel(theme) {
  return THEME_LABELS[theme] ?? theme.replace(/_/g, " ");
}

export function themeDescription(theme) {
  return THEME_DESCRIPTIONS[theme] ?? "A recurring error pattern in your games.";
}

function apiUrl(path) {
  return `${BASE}${path}`;
}

function withTc(path, tc) {
  if (!tc || tc === "all") return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}tc=${encodeURIComponent(tc)}`;
}

async function request(path, options = {}) {
  const url = apiUrl(path);
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      throw new Error(`API error ${res.status} for ${path}`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof TypeError || err.message === "Failed to fetch") {
      throw new Error(
        BASE
          ? `Cannot reach backend at ${BASE}. Check that the server is running and CORS allows this site.`
          : `Cannot reach backend at ${window.location.origin}${path}. Start the API with: cd backend && uvicorn main:app --reload --port 8000`,
      );
    }
    throw err;
  }
}

async function get(path) {
  const snap = demoSnapshot(path);
  if (snap !== undefined) return snap;
  return request(path);
}

async function post(path, body) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function checkBackendHealth() {
  return get("/health");
}

/**
 * Wait for the backend to be reachable. The free Render instance sleeps after
 * ~15 min idle and refuses connections for up to a minute while it cold-starts,
 * so the first real request would otherwise fail with "cannot reach backend".
 * Polls /health until it responds. Returns true once up, false if it never came
 * up within the budget. `onAttempt(n)` fires on each failed probe.
 * @param {{ retries?: number, delayMs?: number, onAttempt?: (n: number) => void }} [opts]
 */
export async function warmBackend({ retries = 24, delayMs = 2500, onAttempt } = {}) {
  for (let i = 0; i < retries; i += 1) {
    try {
      await checkBackendHealth();
      return true;
    } catch {
      onAttempt?.(i + 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

export function fetchProfile(username, tc = "all") {
  return get(withTc(`/profile/${username}`, tc));
}

export async function fetchWeaknessProfile(username, tc = "all") {
  const data = await fetchProfile(username, tc);
  return {
    weaknesses: (data.profile ?? []).map((row) => ({
      theme: row.theme,
      display: themeLabel(row.theme),
      description: themeDescription(row.theme),
      frequency: row.frequency,
      severity: Math.round(row.severity),
      last_seen: row.last_seen,
    })),
    stats: data.stats ?? {},
    meta: data.meta ?? {},
  };
}

/** @param {string} username @param {{ theme?: string, limit?: number }} [opts] */
export const fetchDrillQueue = (username, { theme, limit = 20 } = {}) => {
  let path = `/drill/${username}/queue?limit=${limit}`;
  if (theme) path += `&theme=${encodeURIComponent(theme)}`;
  return get(path).then((d) => d.positions ?? []);
};

export const recordDrillAttempt = (username, positionId, correct) =>
  post(`/drill/${username}/attempt`, { position_id: positionId, correct });

export const fetchMastery = (username) =>
  get(`/drill/${username}/mastery`).then((d) => d.mastery ?? []);

export const fetchOpeningStats = (username, tc = "all") =>
  get(withTc(`/openings/${username}`, tc));

/** @param {string} username @param {string} [tc] @param {{ theme?: string, limit?: number }} [opts] */
export const fetchBlunderExamples = (username, tc = "all", { theme, limit } = {}) => {
  let path = withTc(`/blunders/${username}`, tc);
  const params = [];
  if (theme) params.push(`theme=${encodeURIComponent(theme)}`);
  if (limit) params.push(`limit=${limit}`);
  if (params.length) path += `${path.includes("?") ? "&" : "?"}${params.join("&")}`;
  return get(path).then((d) => d.blunders ?? []);
};

export const fetchTimeline = (username, tc = "all") =>
  get(withTc(`/timeline/${username}`, tc)).then((d) => d.points ?? []);

export const fetchGmList = () =>
  get("/gms").then((d) => d.gms ?? []);

export const fetchStyleGap = (username, gmSlug = "morphy") =>
  get(`/style-gap/${username}?gm=${encodeURIComponent(gmSlug)}`);

export const fetchStyleMatch = (username) => get(`/style/${username}/match`);

export async function sendCoachMessage(username, message, history = []) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(apiUrl("/coach"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, message, history }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    return { response: data.response ?? "", action: data.action ?? null };
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Coach timed out. The report took too long; try a shorter question.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const triggerIngest = (username) => post(`/ingest/${username}`, {});

export const fetchIngestStatus = (jobId) => get(`/jobs/${jobId}`);

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

export function formatAnalysisRange(meta) {
  const start = fmtDate(meta?.earliest_game);
  const end = fmtDate(meta?.latest_game);
  if (!start) return null;
  if (!end || start === end) return start;
  return `${start} – ${end}`;
}

export const CP_LOSS_EXPLANATION =
  "Centipawn loss (cp) measures how much worse your move was vs. Stockfish's best line. 100 cp ≈ one pawn. Lower is better: under 20 cp is solid; 200+ cp is usually a blunder.";

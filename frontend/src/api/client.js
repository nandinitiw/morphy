// All backend API calls live here.
//
// Local dev: leave VITE_API_URL empty — Vite proxies to localhost:8000 (see vite.config.js)
// Production (Vercel): set VITE_API_URL to your hosted backend, e.g. https://morphy-api.onrender.com

const BASE = import.meta.env.VITE_API_URL ?? "";

export function getApiBase() {
  return BASE || window.location.origin;
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
  time_pressure: "Time pressure",
  positional: "Positional play",
};

const THEME_DESCRIPTIONS = {
  missed_fork: "You missed a move that attacks two or more valuable pieces at once.",
  missed_pin: "A piece was pinned to a more valuable piece behind it, and you didn't exploit or defend it.",
  missed_skewer: "You missed a line where a valuable piece is attacked and must move, exposing another piece.",
  missed_mate: "A forced checkmate was available and you played something else.",
  missed_check: "You overlooked a strong checking move that wins material or creates a decisive threat.",
  missed_discovered_check: "Moving one piece could have unveiled an attack from another — with check.",
  missed_double_check: "Two pieces could have checked the king simultaneously — almost always devastating.",
  missed_hanging_piece: "An undefended piece was there for the taking.",
  missed_back_rank: "Your king was trapped on the back rank with a mating threat you missed.",
  king_safety: "You left your king exposed — loose pawns, open files, or delayed castling.",
  time_pressure: "Errors clustered when you were low on the clock.",
  positional: "Not a single-shot tactic — slow mistakes like weak squares, bad trades, passive piece placement, or misjudging pawn structure. Stockfish found a clearly better plan you overlooked.",
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

export const fetchTimePressure = (username) => get(`/profile/${username}/time-pressure`);

export const fetchOpeningStats = (username, tc = "all") =>
  get(withTc(`/openings/${username}`, tc));

export const fetchBlunderExamples = (username, tc = "all") =>
  get(withTc(`/blunders/${username}`, tc)).then((d) => d.blunders ?? []);

export const fetchGmList = () =>
  get("/gms").then((d) => d.gms ?? []);

export const fetchStyleGap = (username, gmSlug = "morphy") =>
  get(`/style-gap/${username}?gm=${encodeURIComponent(gmSlug)}`);

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
    return data.response ?? "";
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Coach timed out — the report took too long. Try a shorter question.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const triggerIngest = (username) => post(`/ingest/${username}`, {});

export const fetchIngestStatus = (jobId) => get(`/jobs/${jobId}`);

export function formatAnalysisSince(meta) {
  if (!meta?.earliest_game) return null;
  const start = new Date(meta.earliest_game);
  if (Number.isNaN(start.getTime())) return null;
  return start.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export const CP_LOSS_EXPLANATION =
  "Centipawn loss (cp) measures how much worse your move was vs. Stockfish's best line. 100 cp ≈ one pawn. Lower is better — under 20 cp is solid; 200+ cp is usually a blunder.";

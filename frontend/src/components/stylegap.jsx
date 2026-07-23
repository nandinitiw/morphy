import { useEffect, useRef, useState } from "react";
import { fetchStyleGap, fetchGmList, sendCoachMessage } from "../api/client";
import AiTooltip from "./AiTooltip";
import RecommendButton from "./RecommendButton";
import CoachMarkdown from "./CoachMarkdown.jsx";
import Chart from "chart.js/auto";
import { chartAnimation } from "../theme.js";

const STAT_LABELS = {
  avg_game_length:   "Avg game length",
  decisive_games:    "Decisive games",
  endgame_reach:     "Reached an endgame",
  check_frequency:   "Check frequency",
  development_speed: "Development speed",
};

const AXIS_HELP = {
  Decisiveness: "How often your games end in a win or loss rather than a draw — high means you play for the win and rarely settle.",
  Endgames: "How often your games are played down into an endgame, instead of being decided while the board is still full.",
  Patience: "How long your games run on average — grinders play long games, attackers finish quickly.",
  Simplifying: "How much material comes off the board by the end — high means you trade down toward clean, technical positions.",
  Attack: "How often you give check — a reliable signal of attacking, tactical play.",
};

// Radar axes, in display order. Keys must match the /style-gap payload.
const AXIS_KEYS   = ["decisiveness", "endgame_tendency", "patience", "simplification", "attack"];
const AXIS_LABELS = ["Decisiveness", "Endgames", "Patience", "Simplifying", "Attack"];

const RADAR_YOU = "#2B2620";   // ink
const RADAR_GM  = "#C1793A";   // ochre

function isGoodForYou(key, youVal, gmVal) {
  const youNum = parseFloat(youVal);
  const gmNum  = parseFloat(gmVal);
  if (Number.isNaN(youNum) || Number.isNaN(gmNum)) return null;
  return Math.abs(youNum - gmNum) < Math.abs(gmNum * 0.3) ? "good" : "bad";
}

export default function StyleGap({ username, onNavigateCoach }) {
  const [gms, setGms]       = useState([]);
  const [gmSlug, setGmSlug] = useState("morphy");
  const [style, setStyle]   = useState(null);
  const [error, setError]   = useState(null);
  const [recoLoading, setRecoLoading] = useState(false);
  const [reco, setReco]     = useState(null);
  const radarRef   = useRef(null);
  const radarChart = useRef(null);

  // Load available GMs once
  useEffect(() => {
    fetchGmList()
      .then((list) => {
        setGms(list);
        if (list.length > 0 && !list.find((g) => g.slug === gmSlug)) {
          setGmSlug(list[0].slug);
        }
      })
      .catch(() => {
        // Placeholder list if backend has no GMs seeded yet
        setGms([
          { slug: "morphy",   display_name: "Paul Morphy" },
          { slug: "tal",      display_name: "Mikhail Tal" },
          { slug: "fischer",  display_name: "Bobby Fischer" },
          { slug: "kasparov", display_name: "Garry Kasparov" },
          { slug: "carlsen",  display_name: "Magnus Carlsen" },
        ]);
      });
  }, []);

  useEffect(() => {
    setStyle(null);
    setError(null);
    setReco(null);
    fetchStyleGap(username, gmSlug)
      .then(setStyle)
      .catch((err) => setError(err.message));
  }, [username, gmSlug]);

  useEffect(() => {
    if (!style || !radarRef.current) return;

    const labels  = AXIS_LABELS;
    const youData = AXIS_KEYS.map((key) => style.you[key]);
    const gmData  = AXIS_KEYS.map((key) => style.gm[key]);

    const chart = new Chart(radarRef.current, {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: "You",
            data: youData,
            borderColor: RADAR_YOU,
            backgroundColor: "rgba(43,38,32,0.06)",
            borderWidth: 2,
            pointBackgroundColor: RADAR_YOU,
            pointRadius: 4,
          },
          {
            label: style.gm_meta?.name ?? gmSlug,
            data: gmData,
            borderColor: RADAR_GM,
            backgroundColor: "rgba(193,121,58,0.10)",
            borderWidth: 2,
            borderDash: [4, 3],
            pointBackgroundColor: RADAR_GM,
            pointRadius: 4,
          },
        ],
      },
      options: {
        animation: chartAnimation(),
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { afterLabel: (ctx) => AXIS_HELP[ctx.label] ?? "" } },
        },
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { display: false },
            pointLabels: { color: "#5C5344", font: { size: 11, family: "IBM Plex Mono" } },
            grid:       { color: "rgba(43,38,32,0.08)" },
            angleLines: { color: "rgba(43,38,32,0.08)" },
          },
        },
      },
    });

    radarChart.current = chart;
    return () => {
      chart.destroy();
      if (radarChart.current === chart) radarChart.current = null;
    };
  }, [style, gmSlug]);

  async function askRecommendations() {
    if (!style) return;
    setRecoLoading(true);
    setReco(null);
    const gmName = style.gm_meta?.name ?? gmSlug;
    const gaps = AXIS_KEYS
      .map((key, i) => `${AXIS_LABELS[i]}: you ${style.you[key]} vs ${gmName} ${style.gm[key]}`)
      .join("; ");
    try {
      const text = await sendCoachMessage(
        username,
        `Compare my style to ${gmName}. Radar gaps: ${gaps}. ` +
          `In 3 bullet points, tell me what to practice to close the biggest style gaps. Be specific.`,
      );
      setReco(text);
    } catch (err) {
      setReco(`Coach unavailable: ${err.message}`);
    } finally {
      setRecoLoading(false);
    }
  }

  const gmName   = style?.gm_meta?.name ?? gms.find((g) => g.slug === gmSlug)?.display_name ?? gmSlug;
  const gmStats  = style?.stats?.[gmSlug] ?? style?.stats?.morphy ?? {};
  const youStats = style?.stats?.you ?? {};
  // Check every axis rather than naming two — the previous version keyed off
  // development/open_files, so renaming those axes silently made this always false.
  const hasRealUserData = style && AXIS_KEYS.some((key) => (style.you?.[key] ?? 0) > 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Style comparison</div>
          <div className="page-sub">your play vs. a grandmaster&apos;s historical fingerprint</div>
        </div>
        {style && <RecommendButton onClick={askRecommendations} loading={recoLoading} label="Give me recommendations" />}
      </div>

      {/* GM selector */}
      <div className="card" style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Compare against
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {gms.map((g) => (
              <button
                key={g.slug}
                onClick={() => setGmSlug(g.slug)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: gmSlug === g.slug ? "var(--accent)" : "var(--border)",
                  background:  gmSlug === g.slug ? "var(--surface)" : "transparent",
                  color:       gmSlug === g.slug ? "var(--text)" : "var(--text-muted)",
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: gmSlug === g.slug ? 600 : 400,
                  transition: "all 0.12s",
                }}
              >
                {g.display_name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {reco && (
        <div className="card ai-insight-card">
          <span className="ai-tip-badge">AI insight</span>
          <div className="ai-summary-text"><CoachMarkdown>{reco}</CoachMarkdown></div>
          {onNavigateCoach && (
            <button type="button" className="link-btn" onClick={() => onNavigateCoach(reco)}>
              Continue in Coach →
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="error">
          {error.includes("not found") || error.includes("404")
            ? `No profile for "${gmName}" seeded yet. Run: cd backend && python -m gm.seed_gms --slug ${gmSlug}`
            : error}
        </div>
      )}

      {!error && !style && <div className="loading">Loading style comparison…</div>}

      {style && (
        <>
          {!hasRealUserData && (
            <div className="card" style={{ borderColor: "rgba(232,164,56,0.3)", background: "rgba(232,164,56,0.05)" }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Your style axes are all zero — no analyzed games found. Run a game analysis first, then revisit this page.
              </p>
            </div>
          )}

          <div className="card">
            <div className="card-title">Head-to-head — {gmName}</div>
            <div className="gm-compare">
              <div className="gm-col">
                <div className="gm-header">You ({username})</div>
                {Object.entries(youStats).map(([key, val]) => (
                  <div className="stat-row" key={key}>
                    <span className="stat-name">{STAT_LABELS[key] ?? key}</span>
                    <span className={`stat-val ${isGoodForYou(key, val, gmStats[key]) ?? ""}`}>{val ?? "—"}</span>
                  </div>
                ))}
              </div>
              <div className="gm-col">
                <div className="gm-header">{gmName}</div>
                {Object.entries(gmStats).map(([key, val]) => (
                  <div className="stat-row" key={key}>
                    <span className="stat-name">{STAT_LABELS[key] ?? key}</span>
                    <span className="stat-val good">{val ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card radar-card">
            <div className="card-title">
              Style radar
              <div className="radar-legend">
                <span><i className="legend-swatch" style={{ background: RADAR_YOU }} /> You</span>
                <span><i className="legend-swatch legend-swatch-dashed" style={{ borderColor: RADAR_GM }} /> {gmName}</span>
              </div>
            </div>
            <p className="radar-hint">
              Hover each axis for what it measures.{" "}
              {style.gm_meta?.games_analyzed != null && (
                <AiTooltip label={`${style.gm_meta.games_analyzed} games analyzed`}>
                  Style fingerprint computed from {style.gm_meta.games_analyzed} real games using move-pattern analysis: development speed, rook file activity, king zone attacks, sacrifice frequency.
                </AiTooltip>
              )}
            </p>
            <div className="chart-wrap" style={{ height: 300 }}>
              <canvas ref={radarRef} role="img" aria-label={`Radar chart comparing your chess style to ${gmName}`} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

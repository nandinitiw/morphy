import { useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { fetchWeaknessProfile, fetchBlunderExamples, fetchTimeline, fetchStyleMatch, formatAnalysisRange, themeLabel } from "../api/client";
import { getIdol, biggestGap } from "../idol.js";
import { uciToSan } from "../notation.js";
import TimeControlFilter from "./TimeControlFilter";
import Chart from "chart.js/auto";
import { chartAnimation } from "../theme.js";

const CHART_GREEN = "#4E6B41";
const CHART_RED = "#B5502F";
const CHART_AMBER = "#C1793A";

function uciSquares(uci) {
  if (!uci || uci.length < 4) return { from: null, to: null };
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

// The single most costly mistake across the analyzed games, shown on a real
// board with the played move (red) and Stockfish's move (green) highlighted.
// This is the dashboard's hero: a personal, visual "here's your biggest leak".
function HeroBlunder({ blunder, onNavigateCoach }) {
  const played = uciSquares(blunder.move_played);
  const best = uciSquares(blunder.best_move);

  const squareStyles = {};
  if (played.from) squareStyles[played.from] = { background: "var(--sq-from)" };
  if (played.to) squareStyles[played.to] = { background: "var(--sq-from)" };
  if (best.from && best.from !== played.from) squareStyles[best.from] = { background: "var(--sq-target)" };
  if (best.to) squareStyles[best.to] = { background: "var(--sq-target)" };

  let orientation = "white";
  try {
    orientation = new Chess(blunder.fen).turn() === "w" ? "white" : "black";
  } catch { /* keep white */ }

  const cpLoss = Math.round(blunder.centipawn_loss ?? 0);
  // Show SAN in the UI; the stored UCI stays for square highlighting.
  const playedSan = uciToSan(blunder.fen, blunder.move_played);
  const bestSan = uciToSan(blunder.fen, blunder.best_move);

  return (
    <div className="card hero-blunder">
      <div className="hero-board">
        <Chessboard
          position={blunder.fen}
          boardWidth={260}
          boardOrientation={orientation}
          arePiecesDraggable={false}
          customSquareStyles={squareStyles}
          customDarkSquareStyle={{ backgroundColor: "#A9754F" }}
          customLightSquareStyle={{ backgroundColor: "#EFE6D3" }}
        />
      </div>
      <div className="hero-info">
        <div className="hero-eyebrow">Your most costly moment</div>
        <div className="hero-cp">−{cpLoss}<span className="hero-cp-unit"> cp</span></div>
        <div className="hero-theme">{themeLabel(blunder.theme)} · move {blunder.move_number}</div>
        <div className="hero-moves">
          <div className="hero-move">
            <span className="hero-move-label">You played</span>
            <span className="hero-move-bad">{playedSan}</span>
          </div>
          <div className="hero-move">
            <span className="hero-move-label">Best was</span>
            <span className="hero-move-good">{bestSan}</span>
          </div>
        </div>
        {onNavigateCoach && (
          <button
            type="button"
            className="hero-cta"
            onClick={() => onNavigateCoach(`Explain this position and how I should have found the best move: FEN ${blunder.fen}. I played ${playedSan}, best was ${bestSan}.`)}
          >
            <i className="ti ti-sparkles" aria-hidden="true" /> Ask the coach about this
          </button>
        )}
      </div>
    </div>
  );
}

// "Play like your idol," surfaced on the dashboard: who you naturally play like,
// who you're training toward, how close you are, and the one habit that closes
// the biggest gap. Hidden until there's analyzed data to compute style from.
function StyleHeroCard({ username, onNavigate }) {
  const [match, setMatch] = useState(null);
  const idolSlug = getIdol(username);

  useEffect(() => {
    fetchStyleMatch(username).then(setMatch).catch(() => setMatch(null));
  }, [username]);

  if (!match || !match.you || !match.gms?.length) return null;
  const closest = match.gms[0];
  const idol = idolSlug ? match.gms.find((g) => g.slug === idolSlug) : null;
  const gap = idol ? biggestGap(match.you, idol.axes, idol.name) : null;

  return (
    <div className="card style-hero">
      <div className="style-hero-head">
        <span className="card-title" style={{ margin: 0 }}>Your style</span>
        <button type="button" className="link-btn" onClick={() => onNavigate?.("style")}>
          Open Style →
        </button>
      </div>
      <div className="style-hero-identity">
        <div className="style-hero-row">
          <span className="style-hero-eyebrow">Most like</span>
          <strong>{closest.name}</strong>
          <span className="style-hero-pct">{closest.match}%</span>
        </div>
        {idol ? (
          <div className="style-hero-row">
            <span className="style-hero-eyebrow">Idol</span>
            <strong className="style-hero-goal">★ {idol.name}</strong>
            <span className="style-hero-pct">{idol.match}% there</span>
          </div>
        ) : (
          <button type="button" className="idol-set-btn" onClick={() => onNavigate?.("style")}>
            ☆ Pick your idol
          </button>
        )}
      </div>
      {gap && (
        <div className="style-hero-gap">
          <div className="style-hero-gap-label">
            Biggest gap to {idol.name}: <strong>{gap.label}</strong>
          </div>
          <div className="style-hero-habit">{gap.habit}</div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ username, refreshKey = 0, tc = "all", onTcChange, onNavigateCoach, onNavigate }) {
  const setTc = onTcChange ?? (() => {});
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState(null);
  const [weaknesses, setWeaknesses] = useState([]);
  const [worstBlunder, setWorstBlunder] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const accuracyRef = useRef(null);
  const accuracyChart = useRef(null);
  const trendRef = useRef(null);
  const trendChart = useRef(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchWeaknessProfile(username, tc)
      .then((data) => {
        setStats(data.stats);
        setMeta(data.meta);
        setWeaknesses(data.weaknesses);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [username, refreshKey, tc]);

  useEffect(() => {
    fetchBlunderExamples(username, tc)
      .then((blunders) => {
        const worst = blunders.reduce(
          (a, b) => ((b.centipawn_loss ?? 0) > (a?.centipawn_loss ?? -1) ? b : a),
          null,
        );
        setWorstBlunder(worst);
      })
      .catch(() => setWorstBlunder(null));
  }, [username, refreshKey, tc]);

  useEffect(() => {
    fetchTimeline(username, tc)
      .then((pts) => setTimeline(pts))
      .catch(() => setTimeline([]));
  }, [username, refreshKey, tc]);

  // Accuracy-over-time line: per-game avg cp loss (faint) with a moving-average
  // trend (bold). Answers "am I improving?" — lower is better.
  useEffect(() => {
    if (!trendRef.current || timeline.length < 2) return undefined;

    const raw = timeline.map((p) => p.avg_cp_loss);
    const windowSize = Math.max(3, Math.round(timeline.length / 6));
    const trend = raw.map((_, i) => {
      const from = Math.max(0, i - windowSize + 1);
      const slice = raw.slice(from, i + 1);
      return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10;
    });

    const chart = new Chart(trendRef.current, {
      type: "line",
      data: {
        labels: timeline.map((p) => p.date),
        datasets: [
          {
            label: "Per game",
            data: raw,
            borderColor: "rgba(193,121,58,0.28)",
            backgroundColor: "rgba(193,121,58,0.07)",
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.3,
            fill: true,
          },
          {
            label: "Trend",
            data: trend,
            borderColor: CHART_AMBER,
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0.35,
          },
        ],
      },
      options: {
        animation: chartAnimation(),
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => items[0].label,
              label: (ctx) =>
                ctx.datasetIndex === 1
                  ? ` trend: ${ctx.parsed.y} cp`
                  : ` this game: ${ctx.parsed.y} cp`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: "#8A8171",
              font: { size: 10, family: "IBM Plex Mono" },
              maxTicksLimit: 6,
              autoSkip: true,
            },
            grid: { display: false },
          },
          y: {
            title: {
              display: true,
              text: "Avg cp loss (lower = better)",
              color: "#8A8171",
              font: { size: 11, family: "IBM Plex Mono" },
            },
            ticks: { color: "#8A8171", font: { size: 10, family: "IBM Plex Mono" } },
            grid: { color: "rgba(43,38,32,0.08)" },
          },
        },
      },
    });


    // Hold the instance in a local, not just the ref. React 18 StrictMode runs
    // effects mount → cleanup → mount; a cleanup that reads the ref can destroy
    // the chart the second run just created, leaving a blank canvas.
    trendChart.current = chart;
    return () => {
      chart.destroy();
      if (trendChart.current === chart) trendChart.current = null;
    };
  }, [timeline, loading]);

  useEffect(() => {
    if (!stats || !accuracyRef.current || weaknesses.length === 0) return undefined;

    const top = weaknesses.slice(0, 6);
    const chart = new Chart(accuracyRef.current, {
      type: "bar",
      data: {
        labels: top.map((w) => themeLabel(w.theme)),
        datasets: [{
          label: "Avg centipawn loss",
          data: top.map((w) => w.severity),
          backgroundColor: top.map((w) =>
            w.severity >= 200 ? CHART_RED : w.severity >= 130 ? CHART_AMBER : "#8A8171",
          ),
          borderRadius: 4,
        }],
      },
      options: {
        animation: chartAnimation(),
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.x} cp avg loss`,
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Centipawn loss (lower = better)",
              color: "#8A8171",
              font: { size: 11, family: "IBM Plex Mono" },
            },
            ticks: { color: "#8A8171", font: { size: 11, family: "IBM Plex Mono" } },
            grid: { color: "rgba(43,38,32,0.08)" },
          },
          y: {
            ticks: { color: "#5C5344", font: { size: 11, family: "IBM Plex Mono" } },
            grid: { display: false },
            // Theme names are long; reserve a fixed gutter so Chart.js can't
            // clip them when it measures before the webfont has loaded.
            afterFit: (scale) => { scale.width = 118; },
          },
        },
      },
    });

    accuracyChart.current = chart;
    return () => {
      chart.destroy();
      if (accuracyChart.current === chart) accuracyChart.current = null;
    };
  }, [stats, weaknesses, loading]);

  if (error) return <div className="error">Failed to load profile: {error.message}</div>;
  if (loading) return <div className="loading">Loading your analysis…</div>;

  const gamesAnalyzed = stats?.games_analyzed ?? 0;
  const dateRange = formatAnalysisRange(meta);
  const tcLabel = tc === "all" ? "all time controls" : tc;

  // Improvement indicator: compare the average cp loss of the first vs last
  // third of the analyzed games. Lower cp loss later = improving.
  let trendDelta = null;
  if (timeline.length >= 6) {
    const third = Math.max(2, Math.floor(timeline.length / 3));
    const early = timeline.slice(0, third);
    const late = timeline.slice(-third);
    const avg = (a) => a.reduce((s, p) => s + p.avg_cp_loss, 0) / a.length;
    trendDelta = Math.round(avg(early) - avg(late)); // positive = improved
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Performance overview</div>
          <div className="page-sub">
            {gamesAnalyzed > 0 ? (
              <>
                Based on <strong>{gamesAnalyzed}</strong> {tcLabel} games
                {dateRange ? <> · <strong>{dateRange}</strong></> : null}
              </>
            ) : (
              "No analyzed games yet — click Refresh games above"
            )}
          </div>
        </div>
      </div>

      <TimeControlFilter value={tc} onChange={setTc} counts={meta?.time_controls} />

      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-label">Games analyzed</div>
          <div className="metric-value">{gamesAnalyzed}</div>
          <div className="metric-delta delta-neutral">{tcLabel}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Blunders / game</div>
          <div className="metric-value">{stats?.blunder_rate?.toFixed(1) ?? "0.0"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total blunders</div>
          <div className="metric-value">{stats?.total_blunders ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Weakness themes</div>
          <div className="metric-value">{weaknesses.length}</div>
        </div>
      </div>

      <StyleHeroCard username={username} onNavigate={onNavigate} />

      {timeline.length >= 2 && (
        <div className="card">
          <div className="card-title">
            Accuracy over time
            <span className="card-hint">avg centipawn loss per game · lower is better</span>
            {trendDelta !== null && trendDelta !== 0 && (
              <span className={`trend-pill ${trendDelta > 0 ? "trend-up" : "trend-down"}`}>
                <i className={`ti ${trendDelta > 0 ? "ti-trending-down" : "ti-trending-up"}`} aria-hidden="true" />
                {trendDelta > 0
                  ? `Improving · ${trendDelta} cp cleaner`
                  : `Up ${Math.abs(trendDelta)} cp — slipping`}
              </span>
            )}
          </div>
          <div className="chart-wrap" style={{ height: 200 }}>
            <canvas ref={trendRef} role="img" aria-label="Line chart of average centipawn loss per game over time" />
          </div>
        </div>
      )}

      {weaknesses.length === 0 ? (
        <div className="card">
          <div className="card-title">{gamesAnalyzed === 0 && tc !== "all" ? `No ${tc} games found` : "No weakness data yet"}</div>
          <p className="empty-copy">
            {gamesAnalyzed === 0 && tc !== "all"
              ? `You don't have any analyzed ${tc} games. Switch to a different time control or run an analysis first.`
              : "Run an analysis from the banner above. Once Stockfish finishes, your tactical blind spots will show up here."}
          </p>
        </div>
      ) : (
        <>
          <div className="dash-hero-row">
            {worstBlunder ? (
              <HeroBlunder blunder={worstBlunder} onNavigateCoach={onNavigateCoach} />
            ) : (
              <div className="card hero-blunder hero-blunder-empty">
                <p className="empty-copy" style={{ margin: 0 }}>
                  No example position stored yet — analyze more games to surface your costliest moment.
                </p>
              </div>
            )}
            <div className="card">
              <div className="card-title">
                Severity by theme
                <span className="card-hint">avg centipawn loss</span>
              </div>
              <div className="chart-wrap" style={{ height: 240 }}>
                <canvas ref={accuracyRef} role="img" aria-label="Bar chart of weakness severity by theme" />
              </div>
              <div className="chart-legend-row">
                <span><i className="legend-swatch" style={{ background: CHART_RED }} /> 200+ cp blunder</span>
                <span><i className="legend-swatch" style={{ background: CHART_AMBER }} /> 130–199 cp</span>
                <span><i className="legend-swatch" style={{ background: "#8A8171" }} /> under 130 cp</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

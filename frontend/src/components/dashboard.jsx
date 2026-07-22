import { useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { fetchWeaknessProfile, fetchBlunderExamples, formatAnalysisRange, themeLabel } from "../api/client";
import TimeControlFilter from "./TimeControlFilter";
import Chart from "chart.js/auto";

const CHART_GREEN = "#22C55E";
const CHART_RED = "#EF4444";
const CHART_AMBER = "#F59E0B";

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
  if (played.from) squareStyles[played.from] = { background: "rgba(224,82,82,0.40)" };
  if (played.to) squareStyles[played.to] = { background: "rgba(224,82,82,0.55)" };
  if (best.from && best.from !== played.from) squareStyles[best.from] = { background: "rgba(129,182,76,0.35)" };
  if (best.to) squareStyles[best.to] = { background: "rgba(129,182,76,0.60)" };

  let orientation = "white";
  try {
    orientation = new Chess(blunder.fen).turn() === "w" ? "white" : "black";
  } catch { /* keep white */ }

  const cpLoss = Math.round(blunder.centipawn_loss ?? 0);

  return (
    <div className="card hero-blunder">
      <div className="hero-board">
        <Chessboard
          position={blunder.fen}
          boardWidth={260}
          boardOrientation={orientation}
          arePiecesDraggable={false}
          customSquareStyles={squareStyles}
          customDarkSquareStyle={{ backgroundColor: "#b58863" }}
          customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
        />
      </div>
      <div className="hero-info">
        <div className="hero-eyebrow">Your most costly moment</div>
        <div className="hero-cp">−{cpLoss}<span className="hero-cp-unit"> cp</span></div>
        <div className="hero-theme">{themeLabel(blunder.theme)} · move {blunder.move_number}</div>
        <div className="hero-moves">
          <div className="hero-move">
            <span className="hero-move-label">You played</span>
            <span className="hero-move-bad">{blunder.move_played ?? "—"}</span>
          </div>
          <div className="hero-move">
            <span className="hero-move-label">Best was</span>
            <span className="hero-move-good">{blunder.best_move ?? "—"}</span>
          </div>
        </div>
        {onNavigateCoach && (
          <button
            type="button"
            className="hero-cta"
            onClick={() => onNavigateCoach(`Explain this position and how I should have found the best move: FEN ${blunder.fen}. I played ${blunder.move_played}, best was ${blunder.best_move}.`)}
          >
            <i className="ti ti-sparkles" aria-hidden="true" /> Ask the coach about this
          </button>
        )}
      </div>
    </div>
  );
}

export default function Dashboard({ username, refreshKey = 0, tc = "all", onTcChange, onNavigateCoach }) {
  const setTc = onTcChange ?? (() => {});
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState(null);
  const [weaknesses, setWeaknesses] = useState([]);
  const [worstBlunder, setWorstBlunder] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const accuracyRef = useRef(null);
  const accuracyChart = useRef(null);

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
    if (accuracyChart.current) {
      accuracyChart.current.destroy();
      accuracyChart.current = null;
    }
    if (!stats || !accuracyRef.current || weaknesses.length === 0) return;

    const top = weaknesses.slice(0, 6);
    accuracyChart.current = new Chart(accuracyRef.current, {
      type: "bar",
      data: {
        labels: top.map((w) => themeLabel(w.theme)),
        datasets: [{
          label: "Avg centipawn loss",
          data: top.map((w) => w.severity),
          backgroundColor: top.map((w) =>
            w.severity >= 200 ? CHART_RED : w.severity >= 130 ? CHART_AMBER : "rgba(250,250,250,0.25)",
          ),
          borderRadius: 4,
        }],
      },
      options: {
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
              color: "rgba(250,250,250,0.45)",
              font: { size: 11, family: "DM Mono" },
            },
            ticks: { color: "rgba(250,250,250,0.4)", font: { size: 11, family: "DM Mono" } },
            grid: { color: "rgba(255,255,255,0.07)" },
          },
          y: {
            ticks: { color: "rgba(250,250,250,0.55)", font: { size: 11, family: "DM Mono" } },
            grid: { display: false },
          },
        },
      },
    });

    return () => accuracyChart.current?.destroy();
  }, [stats, weaknesses]);

  if (error) return <div className="error">Failed to load profile: {error.message}</div>;
  if (loading) return <div className="loading">Loading your analysis…</div>;

  const gamesAnalyzed = stats?.games_analyzed ?? 0;
  const dateRange = formatAnalysisRange(meta);
  const tcLabel = tc === "all" ? "all time controls" : tc;

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
                <span><i className="legend-swatch" style={{ background: "rgba(250,250,250,0.25)" }} /> under 130 cp</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

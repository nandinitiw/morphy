import { useEffect, useRef, useState } from "react";
import { fetchWeaknessProfile, formatAnalysisSince, themeLabel } from "../api/client";
import AiTooltip from "./AiTooltip";
import TimeControlFilter from "./TimeControlFilter";
import Chart from "chart.js/auto";

const CHART_GREEN = "#22C55E";
const CHART_RED = "#EF4444";
const CHART_AMBER = "#F59E0B";

export default function Dashboard({ username, refreshKey = 0, tc = "all", onTcChange }) {
  const setTc = onTcChange ?? (() => {});
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState(null);
  const [weaknesses, setWeaknesses] = useState([]);
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

  const maxFreq = Math.max(...weaknesses.map((w) => w.frequency), 1);
  const gamesAnalyzed = stats?.games_analyzed ?? 0;
  const since = formatAnalysisSince(meta);
  const tcLabel = tc === "all" ? "all time controls" : tc;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Performance overview</div>
          <div className="page-sub">
            {gamesAnalyzed > 0 ? (
              <>
                Based on <strong>{gamesAnalyzed}</strong> {tcLabel} games analyzed
                {since ? <> since <strong>{since}</strong></> : null} for {username}
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
        <div className="three-col">
          <div className="card">
            <div className="card-title">
              Severity by theme
              <span className="card-hint">avg centipawn loss per theme</span>
            </div>
            <div className="chart-wrap" style={{ height: 220 }}>
              <canvas ref={accuracyRef} role="img" aria-label="Bar chart of weakness severity by theme" />
            </div>
            <div className="chart-legend-row">
              <span><i className="legend-swatch" style={{ background: CHART_RED }} /> 200+ cp blunder</span>
              <span><i className="legend-swatch" style={{ background: CHART_AMBER }} /> 130–199 cp</span>
              <span><i className="legend-swatch" style={{ background: "rgba(250,250,250,0.25)" }} /> under 130 cp</span>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Top weaknesses</div>
            <div className="weakness-list">
              {weaknesses.slice(0, 6).map((w) => (
                <div className="weakness-item" key={w.theme}>
                  <div className="weakness-header">
                    <span className="weakness-name">
                      <AiTooltip label={w.display}>{w.description}</AiTooltip>
                    </span>
                    <span className="weakness-count">{w.frequency}× · {w.severity}cp</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(w.frequency / maxFreq) * 100}%`, background: CHART_RED }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

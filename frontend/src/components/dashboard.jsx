import { useEffect, useRef, useState } from "react";
import { fetchProfile, fetchWeaknessProfile } from "../api/client";
import Chart from "chart.js/auto";

// ── Placeholder data — replace once backend is running ───────────────────────
const MOCK_PROFILE = {
  win_rate: 58,
  avg_accuracy: 81.4,
  blunder_rate: 1.3,
  games_analyzed: 147,
  accuracy_trend: [77, 78, 76, 80, 79, 81, 82, 83],
  win_loss_by_tc: { Bullet: [44, 8, 48], Blitz: [58, 10, 32], Rapid: [67, 11, 22] },
};

const MOCK_WEAKNESSES = [
  { theme: "missed_fork", frequency: 34, severity: 180 },
  { theme: "time_pressure", frequency: 28, severity: 150 },
  { theme: "back_rank", frequency: 19, severity: 220 },
  { theme: "king_safety", frequency: 14, severity: 160 },
];

const THEME_LABELS = {
  missed_fork: "Missed fork",
  time_pressure: "Time pressure",
  back_rank: "Back rank",
  king_safety: "King safety",
  missed_pin: "Missed pin",
  positional: "Positional",
};

export default function Dashboard({ username }) {
  const [profile, setProfile] = useState(null);
  const [weaknesses, setWeaknesses] = useState([]);
  const [error, setError] = useState(null);
  const accuracyRef = useRef(null);
  const tcRef = useRef(null);
  const accuracyChart = useRef(null);
  const tcChart = useRef(null);

  useEffect(() => {
    // TODO: swap MOCK_PROFILE for real fetch once backend is ready:
    // fetchProfile(username).then(setProfile).catch(setError);
    // fetchWeaknessProfile(username).then(d => setWeaknesses(d.weaknesses)).catch(setError);
    setProfile(MOCK_PROFILE);
    setWeaknesses(MOCK_WEAKNESSES);
  }, [username]);

  useEffect(() => {
    if (!profile || !accuracyRef.current || !tcRef.current) return;

    const isDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const textColor = isDark ? "rgba(232,227,213,0.4)" : "rgba(0,0,0,0.4)";
    const gridColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

    if (accuracyChart.current) accuracyChart.current.destroy();
    accuracyChart.current = new Chart(accuracyRef.current, {
      type: "line",
      data: {
        labels: profile.accuracy_trend.map((_, i) => `Wk${i + 1}`),
        datasets: [{
          data: profile.accuracy_trend,
          borderColor: "#C9A84C",
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#C9A84C",
          fill: true,
          backgroundColor: "rgba(201,168,76,0.07)",
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor, font: { size: 11, family: "DM Mono" } }, grid: { color: gridColor } },
          y: { min: 70, max: 90, ticks: { color: textColor, font: { size: 11, family: "DM Mono" } }, grid: { color: gridColor } },
        },
      },
    });

    if (tcChart.current) tcChart.current.destroy();
    const tcData = profile.win_loss_by_tc;
    tcChart.current = new Chart(tcRef.current, {
      type: "bar",
      data: {
        labels: Object.keys(tcData),
        datasets: [
          { label: "Win", data: Object.values(tcData).map(v => v[0]), backgroundColor: "#4A9B7F" },
          { label: "Draw", data: Object.values(tcData).map(v => v[1]), backgroundColor: "rgba(255,255,255,0.15)" },
          { label: "Loss", data: Object.values(tcData).map(v => v[2]), backgroundColor: "#C0392B" },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { stacked: true, ticks: { color: textColor, font: { size: 11, family: "DM Mono" } }, grid: { color: gridColor } },
          y: { stacked: true, ticks: { color: textColor, font: { size: 11, family: "DM Mono" } }, grid: { display: false } },
        },
      },
    });

    return () => {
      accuracyChart.current?.destroy();
      tcChart.current?.destroy();
    };
  }, [profile]);

  if (error) return <div className="error">Failed to load profile: {error.message}</div>;
  if (!profile) return <div className="loading">Loading...</div>;

  const maxFreq = Math.max(...weaknesses.map(w => w.frequency));

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Performance overview</div>
        <div className="page-sub">last 90 days · {profile.games_analyzed} games</div>
      </div>

      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-label">Win rate</div>
          <div className="metric-value">{profile.win_rate}%</div>
          <div className="metric-delta delta-up">↑ vs last period</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg accuracy</div>
          <div className="metric-value">{profile.avg_accuracy.toFixed(1)}</div>
          <div className="metric-delta delta-up">↑ improving</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Blunder rate</div>
          <div className="metric-value">{profile.blunder_rate.toFixed(1)}<span>/game</span></div>
          <div className="metric-delta delta-down">monitor this</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Games analyzed</div>
          <div className="metric-value">{profile.games_analyzed}</div>
          <div className="metric-delta delta-neutral">+12 this week</div>
        </div>
      </div>

      <div className="three-col">
        <div className="card">
          <div className="card-title">Accuracy trend</div>
          <div className="chart-wrap" style={{ height: 160 }}>
            <canvas ref={accuracyRef} role="img" aria-label="Line chart showing accuracy trend over recent weeks" />
          </div>
        </div>
        <div className="card">
          <div className="card-title">Top weaknesses</div>
          <div className="weakness-list">
            {weaknesses.map(w => (
              <div className="weakness-item" key={w.theme}>
                <div className="weakness-header">
                  <span className="weakness-name">{THEME_LABELS[w.theme] ?? w.theme}</span>
                  <span className="weakness-count">{w.frequency}×</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(w.frequency / maxFreq) * 100}%`, background: "#C0392B" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Win / loss by time control</div>
        <div className="chart-wrap" style={{ height: 140 }}>
          <canvas ref={tcRef} role="img" aria-label="Horizontal bar chart showing win rates by time control" />
        </div>
      </div>
    </div>
  );
}
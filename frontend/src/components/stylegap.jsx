import { useEffect, useRef, useState } from "react";
import { fetchStyleGap } from "../api/client";
import Chart from "chart.js/auto";

const MOCK_STYLE = {
  you: { development: 72, open_files: 61, king_attack: 18, sacrifice_rate: 14, aggression: 40 },
  morphy: { development: 95, open_files: 88, king_attack: 67, sacrifice_rate: 70, aggression: 90 },
  stats: {
    you: { avg_game_length: 38, sacrifice_rate: "2%", open_file_control: "61%", king_attack_freq: "18%", development_speed: "move 8.2" },
    morphy: { avg_game_length: 28, sacrifice_rate: "14%", open_file_control: "88%", king_attack_freq: "67%", development_speed: "move 5.1" },
  },
};

const STAT_LABELS = {
  avg_game_length: "Avg game length",
  sacrifice_rate: "Piece sacrifice rate",
  open_file_control: "Open file control",
  king_attack_freq: "King attack frequency",
  development_speed: "Development speed",
};

function isGoodForYou(key, youVal, morphyVal) {
  // Heuristic: closer to Morphy = good
  const youNum = parseFloat(youVal);
  const morphyNum = parseFloat(morphyVal);
  if (isNaN(youNum) || isNaN(morphyNum)) return null;
  return Math.abs(youNum - morphyNum) < Math.abs(morphyNum * 0.3) ? "good" : "bad";
}

export default function StyleGap({ username }) {
  const [style, setStyle] = useState(null);
  const [error, setError] = useState(null);
  const radarRef = useRef(null);
  const radarChart = useRef(null);

  useEffect(() => {
    // TODO: fetchStyleGap(username).then(setStyle).catch(setError);
    setStyle(MOCK_STYLE);
  }, [username]);

  useEffect(() => {
    if (!style || !radarRef.current) return;
    const isDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const textColor = isDark ? "rgba(232,227,213,0.4)" : "rgba(0,0,0,0.4)";
    const gridColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

    const labels = ["Development", "Open files", "King attack", "Sacrifices", "Aggression"];
    const youData = [style.you.development, style.you.open_files, style.you.king_attack, style.you.sacrifice_rate, style.you.aggression];
    const morphyData = [style.morphy.development, style.morphy.open_files, style.morphy.king_attack, style.morphy.sacrifice_rate, style.morphy.aggression];

    if (radarChart.current) radarChart.current.destroy();
    radarChart.current = new Chart(radarRef.current, {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: "You",
            data: youData,
            borderColor: "#C9A84C",
            backgroundColor: "rgba(201,168,76,0.1)",
            borderWidth: 2,
            pointBackgroundColor: "#C9A84C",
            pointRadius: 3,
          },
          {
            label: "Morphy",
            data: morphyData,
            borderColor: "#4A9B7F",
            backgroundColor: "rgba(74,155,127,0.07)",
            borderWidth: 2,
            borderDash: [4, 3],
            pointBackgroundColor: "#4A9B7F",
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false },
            pointLabels: { color: textColor, font: { size: 11, family: "DM Mono" } },
            grid: { color: gridColor },
            angleLines: { color: gridColor },
          },
        },
      },
    });

    return () => radarChart.current?.destroy();
  }, [style]);

  if (error) return <div className="error">Failed to load style data: {error.message}</div>;
  if (!style) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Style gap — Paul Morphy</div>
        <div className="page-sub">your play vs. morphy's fingerprint</div>
      </div>

      <div className="card">
        <div className="card-title">Style comparison</div>
        <div className="gm-compare">
          <div className="gm-col">
            <div className="gm-header">You ({username})</div>
            {Object.entries(style.stats.you).map(([key, val]) => (
              <div className="stat-row" key={key}>
                <span className="stat-name">{STAT_LABELS[key] ?? key}</span>
                <span className={`stat-val ${isGoodForYou(key, val, style.stats.morphy[key]) ?? ""}`}>{val}</span>
              </div>
            ))}
          </div>
          <div className="gm-col">
            <div className="gm-header">Paul Morphy (historical)</div>
            {Object.entries(style.stats.morphy).map(([key, val]) => (
              <div className="stat-row" key={key}>
                <span className="stat-name">{STAT_LABELS[key] ?? key}</span>
                <span className="stat-val good">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Style radar
          <div style={{ display: "flex", gap: 16, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 20, height: 2, background: "#C9A84C", display: "inline-block" }} /> You
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 20, height: 2, background: "#4A9B7F", display: "inline-block", borderTop: "2px dashed #4A9B7F" }} /> Morphy
            </span>
          </div>
        </div>
        <div className="chart-wrap" style={{ height: 240 }}>
          <canvas ref={radarRef} role="img" aria-label="Radar chart comparing your chess style to Paul Morphy" />
        </div>
      </div>
    </div>
  );
}
import { useEffect, useRef, useState } from "react";
import { fetchOpeningStats } from "../api/client";
import Chart from "chart.js/auto";

const MOCK_OPENINGS = {
  white: [
    { eco: "C50", name: "Italian Game", games: 31, win_rate: 68, draw_rate: 10, loss_rate: 22, avg_accuracy: 18 },
    { eco: "C60", name: "Ruy Lopez", games: 24, win_rate: 54, draw_rate: 12, loss_rate: 34, avg_accuracy: 24 },
    { eco: "C30", name: "King's Gambit", games: 11, win_rate: 45, draw_rate: 9, loss_rate: 46, avg_accuracy: 28 },
    { eco: "D02", name: "London System", games: 8, win_rate: 75, draw_rate: 12, loss_rate: 13, avg_accuracy: 16 },
  ],
  black: [
    { eco: "B20", name: "Sicilian Defense", games: 42, win_rate: 60, draw_rate: 8, loss_rate: 32, avg_accuracy: 21 },
    { eco: "C00", name: "French Defense", games: 18, win_rate: 39, draw_rate: 17, loss_rate: 44, avg_accuracy: 31 },
    { eco: "B10", name: "Caro-Kann", games: 13, win_rate: 62, draw_rate: 15, loss_rate: 23, avg_accuracy: 19 },
    { eco: "E60", name: "King's Indian", games: 9, win_rate: 44, draw_rate: 11, loss_rate: 45, avg_accuracy: 26 },
  ],
};

function OpeningRow({ opening }) {
  const isWin = opening.win_rate >= 55;
  return (
    <div className="opening-row">
      <span className="opening-name">{opening.name} <span style={{ opacity: 0.4, fontFamily: "var(--mono)", fontSize: 11 }}>({opening.eco})</span></span>
      <span className="opening-games">{opening.games}</span>
      <div className="win-bar-wrap">
        <div className="win-seg" style={{ width: `${opening.win_rate}%`, background: "#4A9B7F" }} />
        <div className="win-seg" style={{ width: `${opening.draw_rate}%`, background: "rgba(255,255,255,0.2)" }} />
        <div className="win-seg" style={{ width: `${opening.loss_rate}%`, background: "#C0392B" }} />
      </div>
      <span className={`badge ${isWin ? "badge-win" : "badge-loss"}`}>{opening.win_rate}%</span>
    </div>
  );
}

export default function Openings({ username }) {
  const [openings, setOpenings] = useState(null);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    // TODO: fetchOpeningStats(username).then(setOpenings).catch(setError);
    setOpenings(MOCK_OPENINGS);
  }, [username]);

  useEffect(() => {
    if (!openings || !chartRef.current) return;
    const isDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const textColor = isDark ? "rgba(232,227,213,0.4)" : "rgba(0,0,0,0.4)";
    const gridColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

    const all = [...openings.white, ...openings.black];
    const colors = all.map(o => o.avg_accuracy > 25 ? "#C0392B" : o.avg_accuracy > 20 ? "#BA7517" : "#4A9B7F");

    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels: all.map(o => o.name.split(" ").slice(0, 2).join(" ")),
        datasets: [{
          data: all.map(o => o.avg_accuracy),
          backgroundColor: colors,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor, font: { size: 11, family: "DM Mono" }, autoSkip: false, maxRotation: 20 }, grid: { display: false } },
          y: {
            ticks: { color: textColor, font: { size: 11, family: "DM Mono" } },
            grid: { color: gridColor },
            title: { display: true, text: "avg centipawn loss", color: textColor, font: { size: 11, family: "DM Mono" } },
          },
        },
      },
    });

    return () => chartInstance.current?.destroy();
  }, [openings]);

  if (error) return <div className="error">Failed to load openings: {error.message}</div>;
  if (!openings) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Opening repertoire</div>
        <div className="page-sub">win rate by ECO code</div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-title">As white</div>
          {openings.white.map(o => <OpeningRow key={o.eco} opening={o} />)}
        </div>
        <div className="card">
          <div className="card-title">As black</div>
          {openings.black.map(o => <OpeningRow key={o.eco} opening={o} />)}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Accuracy by opening (avg centipawn loss — lower is better)</div>
        <div className="chart-wrap" style={{ height: 180 }}>
          <canvas ref={chartRef} role="img" aria-label="Bar chart of average centipawn loss per opening" />
        </div>
      </div>
    </div>
  );
}
import { useCallback, useEffect, useRef, useState } from "react";
import CoachMarkdown from "./CoachMarkdown.jsx";
import { fetchOpeningStats, sendCoachMessage } from "../api/client";
import Chart from "chart.js/auto";

const CHART_GREEN = "#4E6B41";
const CHART_RED = "#B5502F";
const CHART_AMBER = "#C1793A";

function OpeningRow({ opening, color, onSelect, selected, summary, summaryLoading }) {
  const isWin = opening.win_rate >= 55;
  const notation = opening.moves_notation || "—";
  const example = opening.example_game;

  return (
    <div className="opening-row-wrap">
      <div
        className={`opening-row ${selected ? "opening-row-selected" : ""}`}
        onClick={() => onSelect(opening, color)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onSelect(opening, color)}
      >
        <span className="opening-name" title={notation}>
          {opening.name}
          <span className="opening-eco">({opening.eco})</span>
          <span className="opening-notation">{notation}</span>
        </span>
        <span className="opening-games">{opening.games}</span>
        <div
          className="win-bar-wrap"
          title={
            example
              ? `W ${opening.win_rate}% · D ${opening.draw_rate}% · L ${opening.loss_rate}% — see example from game #${example.game_id.slice(-6)}`
              : `W ${opening.win_rate}% · D ${opening.draw_rate}% · L ${opening.loss_rate}%`
          }
        >
          <div className="win-seg win-seg-win" style={{ width: `${opening.win_rate}%` }} />
          <div className="win-seg win-seg-draw" style={{ width: `${opening.draw_rate}%` }} />
          <div className="win-seg win-seg-loss" style={{ width: `${opening.loss_rate}%` }} />
        </div>
        <span className={`badge ${isWin ? "badge-win" : "badge-loss"}`}>{opening.win_rate}%</span>
        {example && (
          <a
            className="opening-example-link"
            href={example.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open example game on Chess.com"
          >
            #{example.game_id.slice(-6)}
          </a>
        )}
      </div>
      {selected && (
        <div className="opening-ai-summary">
          <span className="ai-tip-badge">AI insight</span>
          {summaryLoading ? (
            <p className="ai-summary-text">Generating opening summary…</p>
          ) : (
            <div className="ai-summary-text"><CoachMarkdown>{summary}</CoachMarkdown></div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Openings({ username, refreshKey = 0 }) {
  const [openings, setOpenings] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryCache = useRef({});
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const askCoach = useCallback(
    (prompt) => sendCoachMessage(username, prompt),
    [username],
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchOpeningStats(username)
      .then(setOpenings)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [username, refreshKey]);

  useEffect(() => {
    if (!openings || !chartRef.current) return;

    const all = [...openings.white, ...openings.black];
    const colors = all.map((o) =>
      o.avg_accuracy > 25 ? CHART_RED : o.avg_accuracy > 20 ? CHART_AMBER : CHART_GREEN,
    );

    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels: all.map((o) => `${o.eco}`),
        datasets: [{
          label: "Avg cp loss",
          data: all.map((o) => o.avg_accuracy),
          backgroundColor: colors,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const o = all[items[0].dataIndex];
                return `${o.name} (${o.eco})`;
              },
              afterTitle: (items) => {
                const o = all[items[0].dataIndex];
                return o.moves_notation || "";
              },
              label: (ctx) => ` ${ctx.parsed.y} cp avg loss`,
              afterLabel: (ctx) => {
                const o = all[ctx.dataIndex];
                if (o.example_game) {
                  return `See example: game #${o.example_game.game_id.slice(-6)}`;
                }
                return "";
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "#8A8171", font: { size: 10, family: "IBM Plex Mono" } },
            grid: { display: false },
            title: {
              display: true,
              text: "ECO code",
              color: "#8A8171",
              font: { size: 11, family: "IBM Plex Mono" },
            },
          },
          y: {
            ticks: { color: "#8A8171", font: { size: 11, family: "IBM Plex Mono" } },
            grid: { color: "rgba(43,38,32,0.08)" },
            title: {
              display: true,
              text: "Centipawn loss (lower = better)",
              color: "#8A8171",
              font: { size: 11, family: "IBM Plex Mono" },
            },
          },
        },
      },
    });


    // Chart.js measures label widths at construction; if the webfont lands after
    // that it under-reserves axis space and clips labels. Re-fit once ready.
    document.fonts?.ready?.then(() => { try { chartInstance.current?.resize(); } catch { /* chart gone */ } });

    return () => chartInstance.current?.destroy();
  }, [openings]);

  async function handleSelect(opening, color) {
    const key = `${color}-${opening.eco}-${opening.name}`;
    if (selected === key) {
      setSelected(null);
      return;
    }
    setSelected(key);

    // Return cached summary immediately — don't re-fetch
    if (summaryCache.current[key]) {
      setSummary(summaryCache.current[key]);
      return;
    }

    setSummary("");
    setSummaryLoading(true);
    try {
      const text = await askCoach(
        `In 2 short paragraphs, summarize my performance in the ${opening.name} (${opening.eco}) as ${color}. ` +
        `Stats: ${opening.games} games, ${opening.win_rate}% wins, ${opening.avg_accuracy} cp avg loss. ` +
        `Opening moves: ${opening.moves_notation || "unknown"}. ` +
        `Give one concrete study recommendation.`,
      );
      summaryCache.current[key] = text;
      setSummary(text);
    } catch (err) {
      setSummary(`Could not reach coach: ${err.message}`);
    } finally {
      setSummaryLoading(false);
    }
  }

  if (error) return <div className="error">Failed to load openings: {error.message}</div>;
  if (loading) return <div className="loading">Loading openings…</div>;

  const empty = openings.white.length === 0 && openings.black.length === 0;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Opening repertoire</div>
        <div className="page-sub">hover rows for notation · click for AI opening summary</div>
      </div>

      {empty ? (
        <div className="card">
          <div className="card-title">No opening data yet</div>
          <p className="empty-copy">Analyze games first — opening stats are built from your ingested PGNs.</p>
        </div>
      ) : (
        <>
          <div className="two-col">
            <div className="card">
              <div className="card-title">As white</div>
              {openings.white.map((o) => (
                <OpeningRow
                  key={`w-${o.eco}-${o.name}`}
                  opening={o}
                  color="white"
                  onSelect={handleSelect}
                  selected={selected === `white-${o.eco}-${o.name}`}
                  summary={summary}
                  summaryLoading={summaryLoading}
                />
              ))}
            </div>
            <div className="card">
              <div className="card-title">As black</div>
              {openings.black.map((o) => (
                <OpeningRow
                  key={`b-${o.eco}-${o.name}`}
                  opening={o}
                  color="black"
                  onSelect={handleSelect}
                  selected={selected === `black-${o.eco}-${o.name}`}
                  summary={summary}
                  summaryLoading={summaryLoading}
                />
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              Accuracy by opening
              <span className="card-hint">avg centipawn loss — hover bars for notation & example games</span>
            </div>
            <div className="chart-wrap" style={{ height: 200 }}>
              <canvas ref={chartRef} role="img" aria-label="Bar chart of average centipawn loss per opening" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { fetchWeaknessProfile, fetchBlunderExamples, sendCoachMessage, themeLabel } from "../api/client";
import AiTooltip from "./AiTooltip";
import RecommendButton from "./RecommendButton";

const severityColor = (s) => {
  if (s >= 200) return "var(--red)";
  if (s >= 130) return "var(--amber)";
  return "rgba(232,231,229,0.35)";
};

function uciSquares(uci) {
  if (!uci || uci.length < 4) return { from: null, to: null };
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function BoardPanel({ blunders, theme }) {
  const examples = blunders.filter((b) => b.theme === theme);
  const [idx, setIdx] = useState(0);

  useEffect(() => { setIdx(0); }, [theme]);

  if (examples.length === 0) {
    return (
      <div className="board-panel" style={{ gridTemplateColumns: "1fr" }}>
        <p className="board-closed-hint">No example positions stored yet — run more game analysis to populate this.</p>
      </div>
    );
  }

  const ex = examples[idx];
  const played = uciSquares(ex.move_played);
  const best = uciSquares(ex.best_move);

  const customSquares = {};
  if (played.from) customSquares[played.from] = { backgroundColor: "rgba(224,82,82,0.4)" };
  if (played.to)   customSquares[played.to]   = { backgroundColor: "rgba(224,82,82,0.55)" };
  if (best.from && best.from !== played.from) customSquares[best.from] = { backgroundColor: "rgba(129,182,76,0.35)" };
  if (best.to)     customSquares[best.to]     = { backgroundColor: "rgba(129,182,76,0.55)" };

  let boardOrientation = "white";
  try {
    const chess = new Chess(ex.fen);
    boardOrientation = chess.turn() === "w" ? "white" : "black";
  } catch (_) { /* keep white */ }

  return (
    <div className="board-panel">
      <div style={{ width: 240, flexShrink: 0 }}>
        <Chessboard
          position={ex.fen}
          boardWidth={240}
          boardOrientation={boardOrientation}
          arePiecesDraggable={false}
          customSquareStyles={customSquares}
          customDarkSquareStyle={{ backgroundColor: "var(--sq-dark, #b58863)" }}
          customLightSquareStyle={{ backgroundColor: "var(--sq-light, #f0d9b5)" }}
        />
      </div>
      <div className="board-panel-info">
        <div className="board-panel-theme">{themeLabel(theme)} · move {ex.move_number}</div>
        <div className="board-panel-move">
          <div>
            <div className="move-label">You played</div>
            <div className="move-bad">{ex.move_played ?? "—"}</div>
          </div>
          <div>
            <div className="move-label">Best was</div>
            <div className="move-good">{ex.best_move ?? "—"}</div>
          </div>
        </div>
        {ex.game_id && !ex.game_id.startsWith("demo_") && (
          <a
            className="board-game-link"
            href={`https://www.chess.com/game/live/${ex.game_id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View full game →
          </a>
        )}
        {examples.length > 1 && (
          <div className="board-panel-nav">
            {examples.map((_, i) => (
              <button
                key={i}
                className="board-nav-btn"
                style={i === idx ? { borderColor: "var(--green)", color: "var(--green)" } : {}}
                onClick={() => setIdx(i)}
              >
                #{i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Weaknesses({ username, refreshKey = 0, tc = "all", onNavigateCoach }) {
  const [weaknesses, setWeaknesses] = useState([]);
  const [blunders, setBlunders] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recoLoading, setRecoLoading] = useState(false);
  const [reco, setReco] = useState(null);
  const [openTheme, setOpenTheme] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchWeaknessProfile(username, tc),
      fetchBlunderExamples(username, tc).catch(() => []),
    ])
      .then(([profileData, blunderData]) => {
        setWeaknesses(profileData.weaknesses);
        setBlunders(blunderData);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [username, refreshKey, tc]);

  async function askRecommendations() {
    setRecoLoading(true);
    setReco(null);
    try {
      const top = weaknesses.slice(0, 3).map((w) => `${w.display} (${w.frequency}×, ${w.severity}cp)`).join(", ");
      const text = await sendCoachMessage(
        username,
        `Based on my top weakness themes (${top || "none yet"}), give me a prioritized study plan with 3 concrete recommendations — puzzles, openings, or habits. Keep it under 200 words.`,
      );
      setReco(text);
    } catch (err) {
      setReco(`Coach unavailable: ${err.message}`);
    } finally {
      setRecoLoading(false);
    }
  }

  function toggleTheme(theme) {
    setOpenTheme((prev) => (prev === theme ? null : theme));
  }

  if (error) return <div className="error">Failed to load weaknesses: {error.message}</div>;
  if (loading) return <div className="loading">Loading weakness profile…</div>;

  // Sort and size bars by severity — frequency compresses into a narrow range,
  // severity is the variable that actually differentiates themes.
  const sorted = [...weaknesses].sort((a, b) => b.severity - a.severity);
  const maxSeverity = Math.max(...weaknesses.map((w) => w.severity), 1);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Weakness fingerprint</div>
          <div className="page-sub">built from analyzed games for {username}</div>
        </div>
        {weaknesses.length > 0 && (
          <RecommendButton onClick={askRecommendations} loading={recoLoading} />
        )}
      </div>

      <div className="card cp-explainer">
        <p className="empty-copy" style={{ marginTop: 0 }}>
          Themes are ordered by how costly they are — the longer the bar, the more damage that mistake type does to your games. Click any row to see an example position on the board.
        </p>
      </div>

      {reco && (
        <div className="card ai-insight-card">
          <span className="ai-tip-badge">AI insight</span>
          <div className="ai-summary-text"><Markdown>{reco}</Markdown></div>
          {onNavigateCoach && (
            <button type="button" className="link-btn" onClick={() => onNavigateCoach(reco)}>
              Continue in Coach →
            </button>
          )}
        </div>
      )}

      {weaknesses.length === 0 ? (
        <div className="card">
          <div className="card-title">No blunders clustered yet</div>
          <p className="empty-copy">
            Analyze more games to build your weakness fingerprint. Blunders are grouped by tactical theme
            (forks, pins, back rank, etc.).
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="card-title">
            Tactical blind spots
            <span className="card-hint">sorted by severity · click a row for an example position</span>
          </div>
          <div className="weakness-list">
            {sorted.map((w) => (
              <div key={w.theme}>
                <div
                  className="weakness-item"
                  onClick={() => toggleTheme(w.theme)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && toggleTheme(w.theme)}
                  aria-expanded={openTheme === w.theme}
                >
                  <div className="weakness-header">
                    <span className="weakness-name">
                      <AiTooltip label={w.display}>{w.description}</AiTooltip>
                    </span>
                    <span className="weakness-count">
                      {w.frequency}× occurrences
                      <i
                        className={`ti ${openTheme === w.theme ? "ti-chevron-up" : "ti-chevron-down"}`}
                        style={{ marginLeft: 8, opacity: 0.45, fontSize: 11 }}
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${(w.severity / maxSeverity) * 100}%`,
                        background: severityColor(w.severity),
                      }}
                    />
                  </div>
                </div>
                {openTheme === w.theme && (
                  <div style={{ paddingBottom: 12 }}>
                    <BoardPanel blunders={blunders} theme={w.theme} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

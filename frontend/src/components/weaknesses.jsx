import { useEffect, useState } from "react";
import { fetchWeaknessProfile, fetchTimePressure } from "../api/client";

const MOCK_WEAKNESSES = [
  { theme: "missed_fork", display: "Missed fork", frequency: 34, severity: 180 },
  { theme: "back_rank", display: "Back-rank threat", frequency: 19, severity: 220 },
  { theme: "missed_pin", display: "Missed pin", frequency: 16, severity: 140 },
  { theme: "king_safety", display: "King safety", frequency: 14, severity: 160 },
  { theme: "positional", display: "Positional errors", frequency: 41, severity: 60 },
];

const MOCK_TIME = {
  time_buckets: { "60s+": 0.04, "30–60s": 0.08, "15–30s": 0.17, "0–15s": 0.29 },
  critical_threshold_seconds: 22,
  insight: "Blunder probability rises sharply under 22s. You play 38% of your moves in this danger zone.",
};

const severityColor = (s) => {
  if (s >= 200) return "#C0392B";
  if (s >= 130) return "#BA7517";
  return "rgba(255,255,255,0.3)";
};

export default function Weaknesses({ username }) {
  const [weaknesses, setWeaknesses] = useState([]);
  const [timePressure, setTimePressure] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // TODO: replace with real fetches:
    // fetchWeaknessProfile(username).then(d => setWeaknesses(d.weaknesses)).catch(setError);
    // fetchTimePressure(username).then(setTimePressure).catch(setError);
    setWeaknesses(MOCK_WEAKNESSES);
    setTimePressure(MOCK_TIME);
  }, [username]);

  if (error) return <div className="error">Failed to load weaknesses: {error.message}</div>;

  const maxFreq = Math.max(...weaknesses.map(w => w.frequency), 1);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Weakness fingerprint</div>
        <div className="page-sub">built from analyzed games</div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-title">Tactical blind spots</div>
          <div className="weakness-list" style={{ gap: 14 }}>
            {weaknesses.map(w => (
              <div className="weakness-item" key={w.theme}>
                <div className="weakness-header">
                  <span className="weakness-name">{w.display}</span>
                  <span className="weakness-count">{w.frequency}× · avg {w.severity}cp loss</span>
                </div>
                <div className="bar-track" style={{ height: 6 }}>
                  <div
                    className="bar-fill"
                    style={{ width: `${(w.frequency / maxFreq) * 100}%`, background: severityColor(w.severity) }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Blunder rate by clock time</div>
          {timePressure && (
            <>
              <div className="time-section">
                {Object.entries(timePressure.time_buckets).map(([label, rate]) => {
                  const pct = Math.round(rate * 100);
                  const color = pct >= 25 ? "#C0392B" : pct >= 15 ? "#BA7517" : "#4A9B7F";
                  return (
                    <div className="time-row" key={label}>
                      <span className="time-label">{label}</span>
                      <div className="time-bar-wrap">
                        <div className="time-bar" style={{ width: `${pct * 3}%`, background: color }} />
                      </div>
                      <span className="time-pct">{pct}%</span>
                    </div>
                  );
                })}
              </div>
              <div className="insight-box">
                <div className="insight-label">engine insight</div>
                <div className="insight-text">
                  {timePressure.insight.replace(
                    `${timePressure.critical_threshold_seconds}s`,
                    ""
                  ).split("under ")[0]}
                  under{" "}
                  <span className="highlight">{timePressure.critical_threshold_seconds}s</span>
                  {timePressure.insight.split(`${timePressure.critical_threshold_seconds}s`)[1]}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
import { useState } from "react";

import About from "./components/About.jsx";
import Coach from "./components/coach.jsx";
import Dashboard from "./components/dashboard.jsx";
import IngestBanner from "./components/IngestBanner.jsx";
import Openings from "./components/openings.jsx";
import StyleGap from "./components/stylegap.jsx";
import Trainer from "./components/trainer.jsx";
import UsernameSetup from "./components/UsernameSetup.jsx";
import Weaknesses from "./components/weaknesses.jsx";
import { useUsername } from "./context/UsernameContext.jsx";
import "./App.css";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "ti-layout-dashboard" },
  { id: "openings", label: "Openings", icon: "ti-chess" },
  { id: "weaknesses", label: "Weaknesses", icon: "ti-report-analytics" },
  { id: "train", label: "Train", icon: "ti-target-arrow" },
  { id: "coach", label: "Coach", icon: "ti-message-circle" },
  { id: "style", label: "Style gap", icon: "ti-user-star" },
  { id: "about", label: "About", icon: "ti-info-circle" },
];

export default function App() {
  const { username, clearUsername } = useUsername();
  const [page, setPage] = useState("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [coachSeed, setCoachSeed] = useState(null);
  const [tc, setTc] = useState("all");

  if (!username) {
    return <UsernameSetup />;
  }

  function goToCoach(context) {
    setCoachSeed(context ?? null);
    setPage("coach");
  }

  function navigate(id) {
    if (id !== "coach") setCoachSeed(null);
    setPage(id);
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="logo">
          <div className="logo-name">♟ Morphy</div>
          <div className="logo-sub">chess coach · powered by AI</div>
        </div>
        <div className="nav-section">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => navigate(n.id)}
            >
              <i className={`ti ${n.icon}`} aria-hidden="true" />
              <span>{n.label}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="user-pill">
            <div className="avatar">{username.slice(0, 2).toUpperCase()}</div>
            <div className="user-name">{username}</div>
          </div>
          <button type="button" className="change-user-btn" onClick={clearUsername}>
            <i className="ti ti-logout" aria-hidden="true" />
            <span>Change user</span>
          </button>
        </div>
      </nav>
      <main className="main">
        <IngestBanner username={username} onComplete={() => setRefreshKey((k) => k + 1)} />
        {page === "dashboard" && <Dashboard username={username} refreshKey={refreshKey} tc={tc} onTcChange={setTc} onNavigateCoach={goToCoach} />}
        {page === "openings" && <Openings username={username} refreshKey={refreshKey} tc={tc} />}
        {page === "weaknesses" && (
          <Weaknesses username={username} refreshKey={refreshKey} tc={tc} onNavigateCoach={goToCoach} />
        )}
        {page === "train" && <Trainer username={username} refreshKey={refreshKey} tc={tc} />}
        {page === "coach" && <Coach username={username} seedMessage={coachSeed} />}
        {page === "style" && <StyleGap username={username} onNavigateCoach={goToCoach} />}
        {page === "about" && <About />}
      </main>
    </div>
  );
}

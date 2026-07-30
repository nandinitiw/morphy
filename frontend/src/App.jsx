import { useEffect, useRef, useState } from "react";

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

// Coach leads — it's the product's identity (a coach that talks to your data),
// so it sits first and is the default landing surface for real users.
const NAV = [
  { id: "coach", label: "Coach", primary: true },
  { id: "dashboard", label: "Dashboard" },
  { id: "weaknesses", label: "Weaknesses" },
  { id: "train", label: "Train" },
  { id: "openings", label: "Openings" },
  { id: "style", label: "Style gap" },
  { id: "about", label: "About" },
];

export default function App() {
  const { username, clearUsername } = useUsername();
  // Real users land in the coach (greeted by its proactive, grounded observation);
  // the demo lands on the snapshot-backed Dashboard so its offline showcase loads
  // instantly instead of firing a cold agent call.
  const landingPage = (name) => (name && name !== "demo" ? "coach" : "dashboard");
  const [page, setPage] = useState(() => landingPage(username));
  const [refreshKey, setRefreshKey] = useState(0);
  const [coachSeed, setCoachSeed] = useState(null);
  const [coachQuestion, setCoachQuestion] = useState(null);
  const [practiceTheme, setPracticeTheme] = useState(null);
  const [tc, setTc] = useState("all");
  const landedRef = useRef(false);

  // Send the user to their landing page once, when they first sign in (the page
  // state was initialized before we knew who they were on a fresh login).
  useEffect(() => {
    if (!username) {
      landedRef.current = false;
      return;
    }
    if (!landedRef.current) {
      landedRef.current = true;
      setPage(landingPage(username));
    }
  }, [username]);

  if (!username) {
    return <UsernameSetup />;
  }

  function goToCoach(context) {
    setCoachSeed(context ?? null);
    setCoachQuestion(null);
    setPage("coach");
  }

  // "Ask the coach about this position" — hands a context-rich question into a
  // grounded coach conversation (the coach answers with the board + explanation).
  function askCoachAboutPosition(question) {
    setCoachQuestion(question ?? null);
    setCoachSeed(null);
    setPage("coach");
  }

  // Coach hands off into the Trainer, pre-filtered to a weakness theme — the
  // "drill your own mistakes" loop. Bump refreshKey so the Trainer refetches
  // even if you were already on it.
  function startDrill(theme) {
    setPracticeTheme(theme ?? null);
    setRefreshKey((k) => k + 1);
    setPage("train");
  }

  function navigate(id) {
    if (id !== "coach") {
      setCoachSeed(null);
      setCoachQuestion(null);
    }
    if (id !== "train") setPracticeTheme(null);
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
              className={`nav-item ${page === n.id ? "active" : ""} ${n.primary ? "nav-item-primary" : ""}`}
              onClick={() => navigate(n.id)}
            >
              <span className="nav-dot" aria-hidden="true" />
              <span>{n.label}</span>
              {n.primary && <i className="ti ti-sparkles nav-item-icon" aria-hidden="true" />}
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
        {page === "dashboard" && <Dashboard username={username} refreshKey={refreshKey} tc={tc} onTcChange={setTc} onNavigateCoach={goToCoach} onNavigate={navigate} />}
        {page === "openings" && <Openings username={username} refreshKey={refreshKey} tc={tc} />}
        {page === "weaknesses" && (
          <Weaknesses username={username} refreshKey={refreshKey} tc={tc} onNavigateCoach={goToCoach} />
        )}
        {page === "train" && <Trainer username={username} refreshKey={refreshKey} tc={tc} themeFilter={practiceTheme} onAskCoach={askCoachAboutPosition} />}
        {page === "coach" && <Coach username={username} seedMessage={coachSeed} seedQuestion={coachQuestion} onStartDrill={startDrill} />}
        {page === "style" && <StyleGap username={username} onNavigateCoach={goToCoach} />}
        {page === "about" && <About />}
      </main>
    </div>
  );
}

import { useState } from "react";

import Coach from "./components/coach.jsx";
import Dashboard from "./components/dashboard.jsx";
import Openings from "./components/openings.jsx";
import StyleGap from "./components/stylegap.jsx";
import Weaknesses from "./components/weaknesses.jsx";
import "./App.css";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "ti-layout-dashboard" },
  { id: "openings", label: "Openings", icon: "ti-chess" },
  { id: "weaknesses", label: "Weaknesses", icon: "ti-report-analytics" },
  { id: "coach", label: "Coach", icon: "ti-message-circle" },
  { id: "style", label: "Style gap", icon: "ti-user-star" },
];

const PAGES = {
  dashboard: Dashboard,
  openings: Openings,
  weaknesses: Weaknesses,
  coach: Coach,
  style: StyleGap,
};

const USERNAME = import.meta.env.VITE_USERNAME ?? "your_chess_com_username";

export default function App() {
  const [page, setPage] = useState("dashboard");
  const Page = PAGES[page];

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="logo">
          <div className="logo-name">Morphy</div>
          <div className="logo-sub">chess coach agent</div>
        </div>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${page === n.id ? "active" : ""}`}
            onClick={() => setPage(n.id)}
          >
            <i className={`ti ${n.icon}`} aria-hidden="true" />
            {n.label}
          </button>
        ))}
        <div className="sidebar-footer">
          <div className="user-pill">
            <div className="avatar">{USERNAME.slice(0, 2).toUpperCase()}</div>
            <div className="user-name">{USERNAME}</div>
          </div>
        </div>
      </nav>
      <main className="main">
        <Page username={USERNAME} />
      </main>
    </div>
  );
}

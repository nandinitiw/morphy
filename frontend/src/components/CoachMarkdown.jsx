import Markdown from "react-markdown";
import { Chessboard } from "react-chessboard";

// Renders coach/AI markdown consistently everywhere it appears (the Coach chat
// plus the recommendation cards on Weaknesses / Openings / Style gap). Handles
// the `chess-board` fenced-code protocol the coach uses to embed positions, and
// opens links in a new tab. Without this, reco cards used a bare <Markdown> that
// showed raw JSON for board blocks and left links/headings unstyled.

function ChessBoardBlock({ value }) {
  try {
    const { fen, label } = JSON.parse(value);
    return (
      <div className="coach-board">
        <div className="coach-board-wrap">
          <Chessboard
            position={fen}
            arePiecesDraggable={false}
            boardWidth={240}
            customDarkSquareStyle={{ backgroundColor: "#769656" }}
            customLightSquareStyle={{ backgroundColor: "#eeeed2" }}
          />
        </div>
        {label && <div className="coach-board-label">{label}</div>}
      </div>
    );
  } catch {
    return <code>{value}</code>;
  }
}

const COMPONENTS = {
  code({ className, children }) {
    const lang = (className ?? "").replace("language-", "");
    if (lang === "chess-board") {
      return <ChessBoardBlock value={String(children).trim()} />;
    }
    return <code className={className}>{children}</code>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

export default function CoachMarkdown({ children }) {
  return <Markdown components={COMPONENTS}>{children}</Markdown>;
}

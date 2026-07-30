export default function About() {
  return (
    <div className="page about-page">
      <div className="page-header">
        <div className="page-title">About Morphy</div>
        <div className="page-sub">how your chess coach works under the hood</div>
      </div>

      <div className="card about-hero">
        <p className="about-lead">
          Morphy ingests your Chess.com games, runs every position through Stockfish, groups your
          mistakes into tactical themes, drills you on the exact positions you got wrong, and pairs it
          all with an AI coach that knows your history — and shows you which legend you play like.
        </p>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-title">How it works</div>
          <ol className="about-steps">
            <li>
              <strong>Ingest</strong> — Pull recent games from Chess.com and store PGNs, openings, and
              time controls.
            </li>
            <li>
              <strong>Analyze</strong> — Stockfish evaluates each of your moves, recording centipawn
              loss, best move, and move classification (blunder, mistake, inaccuracy).
            </li>
            <li>
              <strong>Classify</strong> — Tactical motifs (fork, pin, back rank, hung piece, bad trade,
              pawn weakness…) are detected from the position where you erred.
            </li>
            <li>
              <strong>Profile</strong> — Blunders are grouped by motif into a weakness fingerprint —
              frequency and average severity per theme.
            </li>
            <li>
              <strong>Drill</strong> — Re-solve the exact positions you got wrong, scheduled by spaced
              repetition: fail one and it resurfaces, master it and it&apos;s pushed out.
            </li>
            <li>
              <strong>Match</strong> — In <em>Legends</em>, your play is mapped against five hand-picked
              grandmasters (my personal favorites). Their full game archives — 13,000+ games — are run
              through the <em>same</em> five-axis style analysis as yours, so the comparison is
              apples-to-apples: who you play like, and how close you are to the idol you&apos;re training
              toward.
            </li>
            <li>
              <strong>Coach</strong> — Claude reads your data via tools, renders your real positions on
              a board, explains what you missed, and queues drills of your own mistakes.
            </li>
          </ol>
        </div>

        <div className="card">
          <div className="card-title">What is Stockfish?</div>
          <p className="about-body">
            Stockfish is an open-source chess engine consistently ranked among the strongest in the
            world. It searches millions of positions per second to find the best move in any given
            position.
          </p>
          <p className="about-body">
            Morphy uses Stockfish to compare <em>your</em> move to the engine&apos;s best move. The gap
            is measured in <strong>centipawns</strong> (1 pawn = 100 centipawns) — a standard way to
            quantify how much evaluation dropped after your move.
          </p>
          <p className="about-body">
            A 200+ cp loss is typically a blunder; repeated patterns at that scale become your weakness
            themes.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Tech stack</div>
        <div className="tech-grid">
          <div className="tech-item">
            <span className="tech-name">Frontend</span>
            <span className="tech-detail">React 18 · Vite · Chart.js</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">Backend</span>
            <span className="tech-detail">FastAPI · Python · SQLAlchemy · SQLite / Postgres</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">Engine</span>
            <span className="tech-detail">Stockfish (local binary)</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">AI coach</span>
            <span className="tech-detail">Claude (Anthropic API) with tool use</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">Data source</span>
            <span className="tech-detail">Chess.com public game archives</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">Weakness profiling</span>
            <span className="tech-detail">Rule-based tactical-motif classification</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">Practice</span>
            <span className="tech-detail">Leitner spaced repetition on your own positions</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">Legend corpus</span>
            <span className="tech-detail">13,000+ archived GM games · same five-axis analysis</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">Deploy</span>
            <span className="tech-detail">Render (Docker) · Vercel · GitHub Actions CI</span>
          </div>
        </div>
      </div>

      <div className="card about-note">
        <span className="ai-tip-badge">AI insight</span>
        <p>
          Violet highlights across the app mark AI-generated coaching content — your signal that an
          expert insight is behind the text, not just raw stats.
        </p>
      </div>
    </div>
  );
}

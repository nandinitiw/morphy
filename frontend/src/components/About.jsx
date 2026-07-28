export default function About() {
  return (
    <div className="page about-page">
      <div className="page-header">
        <div className="page-title">About Morphy</div>
        <div className="page-sub">how your chess coach works under the hood</div>
      </div>

      <div className="card about-hero">
        <p className="about-lead">
          Morphy ingests your Chess.com games, runs every position through Stockfish, clusters your
          mistakes into tactical themes, and pairs that data with an AI coach that knows your history.
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
              <strong>Classify</strong> — Tactical motifs (forks, pins, back rank, etc.) are detected
              from the position where you erred.
            </li>
            <li>
              <strong>Profile</strong> — Blunders are clustered into a weakness fingerprint — frequency
              and average severity per theme.
            </li>
            <li>
              <strong>Coach</strong> — Claude reads your data via tools and gives targeted study plans,
              opening notes, and puzzle links.
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
            <span className="tech-detail">FastAPI · Python · SQLAlchemy</span>
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

# Morphy

A chess coaching agent that ingests your Chess.com games, runs Stockfish analysis on every position, clusters your mistakes into a persistent weakness profile, and lets you chat with an AI coach that has live access to all of it.

**[Try the demo →]([https://morphy.vercel.app](https://morphy-byvlfiykt-nandinis-projects-19f8bc87.vercel.app/))** *(no Chess.com account needed)*

---

## What it does

1. **Ingests** your public Chess.com games via their API
2. **Analyses** every position with Stockfish — blunders, centipawn loss, tactical motifs
3. **Profiles** your weaknesses by clustering mistakes across games (missed forks, back-rank blindness, etc.)
4. **Compares** your playing style to grandmasters across 5 axes (development speed, open-file control, king attack, sacrifice rate, aggression)
5. **Coaches** you via a multi-turn AI agent (Claude) that can pull your game history, weakness profile, and Lichess puzzles mid-conversation — and show you positions on an interactive board

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Chart.js, react-chessboard, react-markdown |
| Backend | FastAPI, SQLAlchemy, SQLite (dev) / Postgres (prod) |
| Analysis | Stockfish via python-chess, scikit-learn for weakness clustering |
| AI coach | Anthropic Claude (tool-use agentic loop, prompt caching) |
| Puzzles | Lichess API |

---

## Local development

### Prerequisites

- Python 3.11+
- Node 18+
- Stockfish: `brew install stockfish` (macOS) or `apt-get install stockfish` (Linux)
- An [Anthropic API key](https://console.anthropic.com) for the AI coach

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...

uvicorn main:app --reload --port 8000
```

The server seeds demo data automatically on first startup.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Enter your Chess.com username or click **Try demo** to explore with pre-loaded games.

### Running tests

```bash
cd backend
python -m pytest tests/ -v
```

---

## Deployment

The frontend is a static Vite build — deploy anywhere. The backend needs Stockfish, persistent storage, and long-running jobs, so it can't run serverless.

### Recommended: Render (backend) + Vercel (frontend)

**1. Deploy the backend on [Render](https://render.com)**

- New Web Service → connect your repo → set root directory to `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Add a Render Disk (mount path `/data`) for SQLite persistence, or attach a Postgres database
- Environment variables:
  ```
  ANTHROPIC_API_KEY=sk-ant-...
  CORS_ORIGINS=https://your-app.vercel.app
  ```
- Note your backend URL, e.g. `https://morphy-api.onrender.com`

> Render's free tier cold-starts after 15 min of inactivity (~30s delay on first request). Upgrade to the $7/month plan to eliminate this.

**2. Deploy the frontend on [Vercel](https://vercel.com)**

- Import repo → set root directory to `frontend`
- Environment variable: `VITE_API_URL=https://morphy-api.onrender.com`
- Deploy

---

## Architecture

```
Chess.com API
      │
      ▼
POST /ingest/{username}          ← frontend triggers on login
      │
      ├─ fetch games (httpx)
      ├─ Stockfish analysis (worker pool)
      ├─ weakness clustering (scikit-learn k-means on position embeddings)
      └─ write to SQLite / Postgres
                  │
                  ▼
         GET /profile/{username}
         GET /style-gap/{username}
         GET /blunders/{username}
         GET /openings/{username}
         POST /coach              ← agentic loop: Claude + 5 tools
```

### AI coach tool loop

Each message to `/coach` runs an agentic loop (up to 10 iterations):

1. Claude reads the conversation history + system prompt (prompt-cached)
2. If it needs data, it calls one or more tools: `get_recent_games`, `get_weakness_profile`, `get_game_details`, `get_opening_stats`, `fetch_practice_puzzles`
3. Tool results are fed back; Claude decides whether to call more tools or respond
4. The final text is returned — Claude can embed `chess-board` fenced blocks that the frontend renders as interactive boards

Conversation history is capped at 10 turns to bound token cost. The system prompt and tool definitions are prompt-cached to reduce latency on follow-up messages.

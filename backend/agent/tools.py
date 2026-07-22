import chess
from sqlalchemy import func
from sqlalchemy.orm import Session
import httpx

from db.models import Game, Position, WeaknessProfile

def uci_to_san(fen: str | None, uci: str | None) -> str:
    """Render a stored UCI move as SAN for the given position.

    Moves are stored in UCI because that's what Stockfish emits, but the coach's
    replies are read by a chess player — "Qd7", not "d8d7". Falls back to the raw
    UCI if the position or move can't be parsed.
    """
    if not uci:
        return "?"
    if not fen:
        return uci
    try:
        board = chess.Board(fen)
        return board.san(chess.Move.from_uci(uci))
    except Exception:
        return uci


TOOLS = [
    {
        "name": "get_recent_games",
        "description": "Fetch the user's most recent analyzed games with their accuracy and result.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Number of recent games to fetch (default 10)"},
            },
        },
    },
    {
        "name": "get_weakness_profile",
        "description": "Get the user's current weakness fingerprint — their persistent tactical and positional blind spots.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_game_details",
        "description": "Get move-by-move analysis for a specific game, including all blunders and missed tactics.",
        "input_schema": {
            "type": "object",
            "properties": {
                "game_id": {"type": "string", "description": "The Chess.com game ID"},
            },
            "required": ["game_id"],
        },
    },
    {
        "name": "get_opening_stats",
        "description": "Get win/loss/draw rates and average accuracy for each opening the user has played.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "fetch_practice_puzzles",
        "description": "Fetch Lichess puzzles targeting a specific weakness theme.",
        "input_schema": {
            "type": "object",
            "properties": {
                "theme": {"type": "string", "description": "Tactical theme e.g. 'fork', 'pin', 'backRankMate'"},
                "limit": {"type": "integer", "default": 5},
            },
            "required": ["theme"],
        },
    },
]


async def execute_tool(tool_name: str, tool_input: dict, username: str, db: Session) -> str:
    try:
        if tool_name == "get_recent_games":
            return _get_recent_games(username, tool_input.get("limit", 10), db)
        if tool_name == "get_weakness_profile":
            return _get_weakness_profile(username, db)
        if tool_name == "get_game_details":
            return _get_game_details(tool_input["game_id"], username, db)
        if tool_name == "get_opening_stats":
            return _get_opening_stats(username, db)
        if tool_name == "fetch_practice_puzzles":
            return await _fetch_puzzles(tool_input["theme"], tool_input.get("limit", 5))
        return f"Unknown tool: {tool_name}"
    except KeyError as exc:
        return f"Tool error ({tool_name}): missing required input {exc.args[0]}"
    except Exception as exc:
        return f"Tool error ({tool_name}): {exc}"


def _get_weakness_profile(username: str, db: Session) -> str:
    profiles = (
        db.query(WeaknessProfile)
        .filter_by(username=username)
        .order_by(WeaknessProfile.severity.desc())
        .all()
    )

    if not profiles:
        return "No weakness profile yet — not enough games analyzed."

    lines = ["Current Weakness Profile:"]
    for profile in profiles:
        last_seen = profile.last_seen.date() if profile.last_seen else "unknown"
        lines.append(
            f"- {profile.theme}: seen {profile.frequency}x, "
            f"avg {profile.severity:.0f} centipawn loss, last seen {last_seen}"
        )
        example = (
            db.query(Position)
            .join(Game)
            .filter(
                Game.username == username,
                Position.is_your_move.is_(True),
                Position.tactical_motif == profile.theme,
            )
            .order_by(Position.centipawn_loss.desc())
            .first()
        )
        if example:
            lines.append(
                f"    Worst example — game {example.game_id}, move {example.move_number}: "
                f"played {uci_to_san(example.fen, example.move_played)}, "
                f"best was {uci_to_san(example.fen, example.best_move)}. "
                f"FEN before move: {example.fen}"
            )
    return "\n".join(lines)


def _get_recent_games(username: str, limit: int, db: Session) -> str:
    games = (
        db.query(Game)
        .filter_by(username=username, analyzed=True)
        .order_by(Game.played_at.desc())
        .limit(limit)
        .all()
    )

    if not games:
        return "No analyzed games yet."

    game_ids = [game.id for game in games]
    blunder_counts = dict(
        db.query(Position.game_id, func.count(Position.id))
        .filter(
            Position.game_id.in_(game_ids),
            Position.is_your_move.is_(True),
            Position.classification == "blunder",
        )
        .group_by(Position.game_id)
        .all()
    )

    lines = [f"Recent {len(games)} games:"]
    for game in games:
        blunders = blunder_counts.get(game.id, 0)
        lines.append(
            f"- {game.id}: {game.result} as {game.player_color}, "
            f"{game.opening_name}, {blunders} blunders"
        )
    return "\n".join(lines)


def _get_game_details(game_id: str, username: str, db: Session) -> str:
    game = db.query(Game).filter_by(id=game_id, username=username).first()
    if not game:
        return f"Game {game_id} not found for user {username}."
    if not game.analyzed:
        return f"Game {game_id} has not been analyzed yet."

    positions = (
        db.query(Position)
        .filter_by(game_id=game_id, is_your_move=True)
        .order_by(Position.move_number)
        .all()
    )

    lines = [
        f"Game {game_id}: {game.result} as {game.player_color}, {game.opening_name}",
        f"Time control: {game.time_control}",
        "",
        "Notable moves:",
    ]

    notable = False
    for position in positions:
        if position.classification not in ("blunder", "mistake", "inaccuracy") and not position.tactical_motif:
            continue
        notable = True
        motif = f", motif: {position.tactical_motif}" if position.tactical_motif else ""
        cp_loss = f"{position.centipawn_loss:.0f}" if position.centipawn_loss is not None else "n/a"
        lines.append(
            f"  Move {position.move_number}: {uci_to_san(position.fen, position.move_played)} "
            f"-> {position.classification} "
            f"(best: {uci_to_san(position.fen, position.best_move)}, cp loss: {cp_loss}{motif})"
        )
        if position.classification in ("blunder", "mistake"):
            lines.append(f"    FEN before move: {position.fen}")

    if not notable:
        lines.append("  No significant errors flagged.")

    return "\n".join(lines)


def _get_opening_stats(username: str, db: Session) -> str:
    games = db.query(Game).filter_by(username=username, analyzed=True).all()
    if not games:
        return "No analyzed games yet."

    # One aggregate query for avg cp loss per game instead of a query per game
    cp_by_game = dict(
        db.query(Position.game_id, func.avg(Position.centipawn_loss))
        .filter(
            Position.game_id.in_([g.id for g in games]),
            Position.is_your_move.is_(True),
            Position.centipawn_loss.isnot(None),
        )
        .group_by(Position.game_id)
        .all()
    )

    stats: dict[str, dict] = {}
    for game in games:
        opening = game.opening_name or game.eco or "Unknown"
        entry = stats.setdefault(opening, {"win": 0, "loss": 0, "draw": 0, "cp_avgs": []})
        entry[game.result] += 1
        if game.id in cp_by_game:
            entry["cp_avgs"].append(cp_by_game[game.id])

    lines = ["Opening statistics:"]
    for opening, data in sorted(
        stats.items(),
        key=lambda item: item[1]["win"] + item[1]["loss"] + item[1]["draw"],
        reverse=True,
    ):
        total = data["win"] + data["loss"] + data["draw"]
        avg_cp = sum(data["cp_avgs"]) / len(data["cp_avgs"]) if data["cp_avgs"] else 0
        lines.append(
            f"- {opening}: {total} games, W{data['win']}/L{data['loss']}/D{data['draw']}, "
            f"avg cp loss {avg_cp:.0f}"
        )
    return "\n".join(lines)


# Map internal weakness theme names → Lichess puzzle theme slugs
_LICHESS_THEME_MAP = {
    "missed_fork": "fork",
    "missed_pin": "pin",
    "missed_skewer": "skewer",
    "missed_mate": "mate",
    "missed_check": "check",
    "missed_discovered_check": "discoveredAttack",
    "missed_double_check": "doubleCheck",
    "missed_hanging_piece": "hangingPiece",
    "missed_back_rank": "backRankMate",
    "king_safety": "kingsideAttack",
    "positional": "advantage",
}


async def _fetch_puzzles(theme: str, limit: int) -> str:
    lichess_theme = _LICHESS_THEME_MAP.get(theme, theme)
    lines = [f"Practice puzzles for '{theme}':"]

    async with httpx.AsyncClient(timeout=10.0) as client:
        for _ in range(limit):
            try:
                resp = await client.get(
                    f"https://lichess.org/api/puzzle/next?theme={lichess_theme}",
                    headers={"Accept": "application/json"},
                )
                if resp.status_code != 200:
                    break
                data = resp.json()
                puzzle = data.get("puzzle", {})
                pid = puzzle.get("id")
                rating = puzzle.get("rating", "?")
                if pid:
                    lines.append(f"- https://lichess.org/training/{pid} (rating: {rating})")
            except Exception:
                break

    if len(lines) == 1:
        return f"Could not fetch puzzles for theme '{theme}' (lichess theme: '{lichess_theme}')"
    return "\n".join(lines)

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
        "name": "queue_practice",
        "description": (
            "Queue a drill of the user's OWN blundered positions for a given weakness "
            "theme so they can re-solve their real mistakes in the Trainer. Prefer this "
            "over generic puzzles — drilling the exact positions they got wrong is the "
            "core of the product. Use the internal theme name (e.g. 'missed_back_rank', "
            "'missed_fork', 'hangs_piece'). Falls back to generic Lichess puzzles only "
            "when the user has too few of their own positions in that theme."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "theme": {"type": "string", "description": "Internal weakness theme, e.g. 'missed_back_rank'"},
                "limit": {"type": "integer", "description": "How many positions to queue (default 5)"},
            },
            "required": ["theme"],
        },
    },
]


async def execute_tool(
    tool_name: str, tool_input: dict, username: str, db: Session
) -> tuple[str, dict | None]:
    """Run a coach tool. Returns (text_for_model, ui_action_or_none).

    Most tools return (text, None). `queue_practice` also returns a UI action so
    the frontend can offer a button that jumps straight into the themed drill.
    """
    try:
        if tool_name == "get_recent_games":
            return _get_recent_games(username, tool_input.get("limit", 10), db), None
        if tool_name == "get_weakness_profile":
            return _get_weakness_profile(username, db), None
        if tool_name == "get_game_details":
            return _get_game_details(tool_input["game_id"], username, db), None
        if tool_name == "get_opening_stats":
            return _get_opening_stats(username, db), None
        if tool_name == "queue_practice":
            return await _queue_practice(
                tool_input["theme"], tool_input.get("limit", 5), username, db
            )
        return f"Unknown tool: {tool_name}", None
    except KeyError as exc:
        return f"Tool error ({tool_name}): missing required input {exc.args[0]}", None
    except Exception as exc:
        return f"Tool error ({tool_name}): {exc}", None


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


async def _queue_practice(
    theme: str, limit: int, username: str, db: Session
) -> tuple[str, dict | None]:
    """Queue the user's own blundered positions for a themed drill.

    Returns (text_for_model, ui_action). The UI action tells the frontend to
    offer a button that opens the Trainer pre-filtered to this theme. When the
    user has too few of their own positions, we top up with generic Lichess
    puzzles so the drill still has enough material.
    """
    from stats import get_blunder_examples  # local import avoids a circular import at module load

    own = get_blunder_examples(username, db, limit_per_theme=limit, theme=theme)
    own_count = len(own)

    lines: list[str] = []
    if own_count:
        lines.append(
            f"Queued {own_count} of the user's OWN {theme} position"
            f"{'s' if own_count != 1 else ''} to drill in the Trainer:"
        )
        for pos in own:
            lines.append(
                f"- game {pos['game_id']} move {pos['move_number']}: played "
                f"{uci_to_san(pos['fen'], pos['move_played'])}, best was "
                f"{uci_to_san(pos['fen'], pos['best_move'])} "
                f"({pos['centipawn_loss']} cp lost)"
            )
    else:
        lines.append(f"The user has no analyzed '{theme}' blunders of their own yet.")

    # Top up with generic Lichess puzzles only when own positions are thin.
    lichess_urls: list[str] = []
    if own_count < limit:
        needed = limit - own_count
        lichess_theme = _LICHESS_THEME_MAP.get(theme, theme)
        async with httpx.AsyncClient(timeout=10.0) as client:
            for _ in range(needed):
                try:
                    resp = await client.get(
                        f"https://lichess.org/api/puzzle/next?theme={lichess_theme}",
                        headers={"Accept": "application/json"},
                    )
                    if resp.status_code != 200:
                        break
                    puzzle = resp.json().get("puzzle", {})
                    pid = puzzle.get("id")
                    if pid:
                        lichess_urls.append(
                            f"https://lichess.org/training/{pid} (rating: {puzzle.get('rating', '?')})"
                        )
                except Exception:
                    break
        if lichess_urls:
            lines.append(
                f"\nTopped up with {len(lichess_urls)} generic Lichess puzzle"
                f"{'s' if len(lichess_urls) != 1 else ''} (not enough own positions yet):"
            )
            lines.extend(f"- {url}" for url in lichess_urls)

    if own_count == 0 and not lichess_urls:
        return (
            f"No practice material available for theme '{theme}'.",
            None,
        )

    action = {
        "type": "drill",
        "theme": theme,
        "own_count": own_count,
        "lichess_urls": lichess_urls,
    }
    return "\n".join(lines), action

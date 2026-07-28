import asyncio

import anthropic

from agent.prompts import COACH_SYSTEM_PROMPT
from agent.tools import TOOLS, execute_tool

client = anthropic.Anthropic()
MAX_TOOL_ITERATIONS = 10
MAX_HISTORY_TURNS = 10
MODEL = "claude-sonnet-4-6"

# Tools list with cache_control on the last entry so the full tool
# definition block is eligible for prompt caching.
_TOOLS_CACHED = [*TOOLS[:-1], {**TOOLS[-1], "cache_control": {"type": "ephemeral"}}]


async def run_coach_session(
    username: str,
    user_message: str,
    db,
    history: list[dict] | None = None,
) -> dict:
    """Run one coach turn. Returns {"response": str, "action": dict | None}.

    `action` is set when a tool queued a UI follow-up (e.g. a themed drill), so
    the frontend can render a "drill these positions" button under the reply.
    """
    messages: list[dict] = []
    pending_action: dict | None = None

    if history:
        capped = history[-(MAX_HISTORY_TURNS * 2):]
        for entry in capped:
            role = entry.get("role")
            content = entry.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user_message})

    # System prompt as a list so we can attach cache_control.
    # The static instructions are cached; the username line is appended
    # separately so cache is shared across turns for the same user.
    system = [
        {
            "type": "text",
            "text": COACH_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": f"You are coaching: {username}",
        },
    ]

    for _ in range(MAX_TOOL_ITERATIONS):
        response = await asyncio.to_thread(
            client.messages.create,
            model=MODEL,
            max_tokens=4096,
            system=system,
            tools=_TOOLS_CACHED,
            messages=messages,
        )

        text_blocks = [block.text for block in response.content if block.type == "text"]
        tool_use_blocks = [block for block in response.content if block.type == "tool_use"]

        if response.stop_reason == "end_turn" or not tool_use_blocks:
            return {"response": "\n".join(text_blocks), "action": pending_action}

        tool_results = []
        for tool_use in tool_use_blocks:
            result, action = await execute_tool(tool_use.name, tool_use.input, username, db)
            if action is not None:
                pending_action = action  # last queued action wins
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": result,
            })

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    return {
        "response": "Coach session exceeded maximum tool iterations.",
        "action": pending_action,
    }

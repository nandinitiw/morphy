import { useState, useRef, useEffect } from "react";
import CoachMarkdown from "./CoachMarkdown.jsx";
import { sendCoachMessage, themeLabel } from "../api/client";

const INITIAL_MESSAGES = [
  {
    role: "coach",
    type: "text",
    content: "Ready to review your games. Ask me anything — I can analyze recent games, pull your weakness profile, or build you a study plan.",
  },
];

// Fired automatically on first open so the coach leads with a grounded, specific
// observation about the user's real games instead of a blank prompt. Sent behind
// the scenes — no visible "you" bubble.
const OPENING_PROMPT =
  "Open the session with ONE specific, grounded observation about my recent games. " +
  "Cite something real from my data (a weakness theme with its frequency, or a recent " +
  "game and result), keep it to 2-3 sentences, and end with a concrete next step or a " +
  "question inviting me to dig in. If I don't have enough analyzed games yet, say so " +
  "briefly and suggest I analyze some.";

const SUGGESTED_PROMPTS = [
  "What's my biggest weakness right now?",
  "Review my worst recent game",
  "Give me 3 puzzles for my weakest theme",
  "Which opening should I stop playing?",
];

function DrillAction({ action, onStartDrill }) {
  const { theme, own_count: ownCount = 0, lichess_urls: lichessUrls = [] } = action;
  const label = themeLabel(theme);
  const total = ownCount + lichessUrls.length;
  const detail =
    ownCount > 0
      ? `${ownCount} of your own position${ownCount === 1 ? "" : "s"}` +
        (lichessUrls.length ? ` + ${lichessUrls.length} to top up` : "")
      : `${lichessUrls.length} practice puzzle${lichessUrls.length === 1 ? "" : "s"}`;
  return (
    <div className="coach-drill-cta">
      <button type="button" className="coach-drill-btn" onClick={() => onStartDrill(theme)}>
        <i className="ti ti-player-play" aria-hidden="true" /> Drill {total} {label} position
        {total === 1 ? "" : "s"}
      </button>
      <span className="coach-drill-detail">{detail}</span>
    </div>
  );
}

function Message({ msg, onStartDrill }) {
  if (msg.type === "tool") {
    return <div className="tool-call">→ {msg.content}</div>;
  }
  const isAi = msg.role === "coach";
  return (
    <div className={`msg ${msg.role}`}>
      <div className="msg-sender">{msg.role === "coach" ? "\u2726 AI coach" : "you"}</div>
      <div className={`msg-bubble ${isAi ? "msg-bubble-ai" : ""}`}>
        {isAi
          ? <CoachMarkdown>{msg.content}</CoachMarkdown>
          : msg.content}
        {msg.action?.type === "drill" && onStartDrill && (
          <DrillAction action={msg.action} onStartDrill={onStartDrill} />
        )}
      </div>
    </div>
  );
}

export default function Coach({ username, seedMessage, seedQuestion, onStartDrill }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const bottomRef = useRef(null);
  const initedRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // One-time init on open, in priority order:
  //  1. A position/question handed in from another page → ask it as the user.
  //  2. A legacy "Continue in Coach" recommendation → show it as a coach bubble.
  //  3. Otherwise lead with a grounded proactive observation (once per session).
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;

    if (seedQuestion) {
      send(seedQuestion, "Explain this position — why was my move a mistake?");
      return;
    }
    if (seedMessage) {
      setMessages((prev) => [...prev, { role: "coach", type: "text", content: seedMessage }]);
      return;
    }
    // Proactive opener — gated to once per user per browser session so switching
    // tabs doesn't re-spend an agent call on every visit.
    const key = `morphy_greeted_${username}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* sessionStorage unavailable — just greet */
    }
    openProactively();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openProactively() {
    setLoading(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    try {
      const { response, action } = await sendCoachMessage(username, OPENING_PROMPT, []);
      // Replace the static greeting with the grounded one.
      setMessages([{ role: "coach", type: "text", content: response, action }]);
    } catch {
      /* backend unreachable — keep the static greeting */
    } finally {
      clearInterval(timerRef.current);
      setLoading(false);
      setElapsed(0);
    }
  }

  // `displayText` lets us show a short, friendly "you" bubble while sending a
  // longer, context-rich prompt (e.g. a FEN + move details) to the agent.
  async function send(overrideText, displayText) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput("");

    const priorMessages = messages;
    setMessages((prev) => [...prev, { role: "user", type: "text", content: displayText ?? text }]);
    setLoading(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    const history = priorMessages
      .filter((m) => m.type === "text")
      .map((m) => ({ role: m.role === "coach" ? "assistant" : "user", content: m.content }));

    try {
      const { response, action } = await sendCoachMessage(username, text, history);
      setMessages((prev) => [...prev, { role: "coach", type: "text", content: response, action }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "coach",
          type: "text",
          content: `Error: ${err.message}`,
        },
      ]);
    } finally {
      clearInterval(timerRef.current);
      setLoading(false);
      setElapsed(0);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Coach session</div>
        <div className="page-sub">AI coach · powered by Claude + your game data</div>
      </div>

      <div className="card" style={{ flex: 1 }}>
        <div className="chat-container">
          <div className="chat-messages">
            {messages.map((msg, i) => <Message key={i} msg={msg} onStartDrill={onStartDrill} />)}
            {messages.length <= 1 && !loading && (
              <div className="coach-suggestions">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="coach-suggestion-chip"
                    onClick={() => send(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            {loading && (
              <div className="tool-call ai-thinking">
                analysing your games{elapsed > 3 ? ` · ${elapsed}s` : "…"}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-row">
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask your coach…"
              disabled={loading}
            />
            <button className="send-btn send-btn-ai" onClick={() => send()} disabled={loading}>
              Send <i className="ti ti-sparkles" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

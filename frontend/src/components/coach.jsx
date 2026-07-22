import { useState, useRef, useEffect } from "react";
import CoachMarkdown from "./CoachMarkdown.jsx";
import { sendCoachMessage } from "../api/client";

const INITIAL_MESSAGES = [
  {
    role: "coach",
    type: "text",
    content: "Ready to review your games. Ask me anything — I can analyze recent games, pull your weakness profile, or build you a study plan.",
  },
];

const SUGGESTED_PROMPTS = [
  "What's my biggest weakness right now?",
  "Review my worst recent game",
  "Give me 3 puzzles for my weakest theme",
  "Which opening should I stop playing?",
];

function Message({ msg }) {
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
      </div>
    </div>
  );
}

export default function Coach({ username, seedMessage }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const bottomRef = useRef(null);
  const seededRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (seedMessage && !seededRef.current) {
      seededRef.current = true;
      setMessages((prev) => [
        ...prev,
        { role: "coach", type: "text", content: seedMessage },
      ]);
    }
  }, [seedMessage]);

  async function send(overrideText) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput("");

    const priorMessages = messages;
    setMessages((prev) => [...prev, { role: "user", type: "text", content: text }]);
    setLoading(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    const history = priorMessages
      .filter((m) => m.type === "text")
      .map((m) => ({ role: m.role === "coach" ? "assistant" : "user", content: m.content }));

    try {
      const response = await sendCoachMessage(username, text, history);
      setMessages((prev) => [...prev, { role: "coach", type: "text", content: response }]);
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
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
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

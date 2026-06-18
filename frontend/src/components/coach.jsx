import { useState, useRef, useEffect } from "react";
import { sendCoachMessage } from "../api/client";

const INITIAL_MESSAGES = [
  {
    role: "coach",
    type: "text",
    content: "Ready to review your games. Ask me anything — I can analyze recent games, pull your weakness profile, or build you a study plan.",
  },
];

function Message({ msg }) {
  if (msg.type === "tool") {
    return <div className="tool-call">→ {msg.content}</div>;
  }
  const isAi = msg.role === "coach";
  return (
    <div className={`msg ${msg.role}`}>
      <div className="msg-sender">{msg.role === "coach" ? "Morphy" : "you"}</div>
      <div className={`msg-bubble ${isAi ? "msg-bubble-ai" : ""}`}>
        {msg.content.split("\n").map((line, i) => (
          <span key={i}>{line}{i < msg.content.split("\n").length - 1 && <br />}</span>
        ))}
      </div>
    </div>
  );
}

export default function Coach({ username, seedMessage }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const seededRef = useRef(false);

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

    // Snapshot current messages before state update so we can build history synchronously
    const priorMessages = messages;
    setMessages((prev) => [...prev, { role: "user", type: "text", content: text }]);
    setLoading(true);

    // Send prior conversation as history (text messages only, role coach→assistant)
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
          content: `Error reaching the backend: ${err.message}. Make sure your FastAPI server is running and ANTHROPIC_API_KEY is set.`,
        },
      ]);
    } finally {
      setLoading(false);
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
            {loading && (
              <div className="tool-call ai-thinking">thinking…</div>
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

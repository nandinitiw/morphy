import { useState, useRef, useEffect } from "react";
import { sendCoachMessage } from "../api/client";

const INITIAL_MESSAGES = [
  {
    role: "coach",
    type: "text",
    content: "Ready to review your games. Ask me anything — I can analyze recent games, pull your weakness profile, or build you a study plan.",
  },
];

// Tool calls the agent makes are streamed back as separate message objects
// so we can render them inline in the chat for transparency.
function Message({ msg }) {
  if (msg.type === "tool") {
    return <div className="tool-call">→ {msg.content}</div>;
  }
  return (
    <div className={`msg ${msg.role}`}>
      <div className="msg-sender">{msg.role === "coach" ? "Morphy" : "you"}</div>
      <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, "<br/>") }} />
    </div>
  );
}

export default function Coach({ username }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    setMessages(prev => [...prev, { role: "user", type: "text", content: text }]);
    setLoading(true);

    try {
      // TODO: once your backend is running, this actually calls the agent.
      // The backend runs the tool-use loop and returns { response, tool_calls_made }.
      // For now, simulate the round-trip:
      await new Promise(r => setTimeout(r, 400));
      setMessages(prev => [...prev, { role: "coach", type: "tool", content: "get_recent_games(limit=5)" }]);
      await new Promise(r => setTimeout(r, 300));
      setMessages(prev => [...prev, { role: "coach", type: "tool", content: "get_weakness_profile()" }]);
      await new Promise(r => setTimeout(r, 400));

      // Swap this block for the real call:
      // const { response, tool_calls_made } = await sendCoachMessage(username, text);
      // tool_calls_made.forEach(tc => setMessages(prev => [...prev, { role: "coach", type: "tool", content: tc }]));
      // setMessages(prev => [...prev, { role: "coach", type: "text", content: response }]);

      setMessages(prev => [...prev, {
        role: "coach",
        type: "text",
        content: "I've pulled your recent games and weakness profile. Your fork blindspot is still the highest-priority issue — it showed up 3 times in your last 5 games. Want me to generate a targeted puzzle set from Lichess?",
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "coach",
        type: "text",
        content: `Error reaching the backend: ${err.message}. Make sure your FastAPI server is running at the URL in your .env file.`,
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Coach session</div>
        <div className="page-sub">agent · tool use enabled</div>
      </div>

      <div className="card" style={{ flex: 1 }}>
        <div className="chat-container">
          <div className="chat-messages">
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {loading && (
              <div className="tool-call" style={{ opacity: 0.5 }}>thinking...</div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-row">
            <input
              className="chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Ask your coach..."
              disabled={loading}
            />
            <button className="send-btn" onClick={send} disabled={loading}>
              Send <i className="ti ti-arrow-right" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
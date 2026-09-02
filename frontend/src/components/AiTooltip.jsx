import { useId, useState } from "react";

/**
 * Hover/focus tooltip for chess concepts. Violet styling = AI/expert insight only.
 * Pass `ai` to fetch a coach response on first hover (cached per prompt).
 */
export default function AiTooltip({
  label,
  children,
  ai = false,
  prompt,
  username,
  onAskCoach,
  position = "top",
}) {
  const [aiText, setAiText] = useState(null);
  const [loading, setLoading] = useState(false);
  const tipId = useId();

  async function handleEnter() {
    if (!ai || aiText || loading || !prompt) return;
    if (onAskCoach) {
      setLoading(true);
      try {
        const text = await onAskCoach(prompt);
        setAiText(text);
      } catch {
        setAiText("AI coach unavailable. Check that ANTHROPIC_API_KEY is set on the backend.");
      } finally {
        setLoading(false);
      }
    }
  }

  const body = ai ? (loading ? "Asking coach…" : aiText || children) : children;

  return (
    <span
      className={`ai-tip-wrap ai-tip-${position}`}
      onMouseEnter={handleEnter}
      onFocus={handleEnter}
      tabIndex={0}
      aria-describedby={tipId}
    >
      {label}
      <span className="ai-tip-trigger" aria-hidden="true">
        <i className="ti ti-sparkles" />
      </span>
      <span className="ai-tip-panel" id={tipId} role="tooltip">
        <span className="ai-tip-badge">AI insight</span>
        {body}
      </span>
    </span>
  );
}

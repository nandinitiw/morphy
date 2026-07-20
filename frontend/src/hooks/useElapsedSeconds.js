import { useEffect, useState } from "react";

// Ticks once a second while `active`, returning whole seconds since `startedAt`
// (a Date.now() timestamp). Returns 0 when inactive.
export function useElapsedSeconds(startedAt, active) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active || !startedAt) return undefined;
    setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt, active]);
  return seconds;
}

export function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

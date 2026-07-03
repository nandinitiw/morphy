import { createContext, useCallback, useContext, useMemo, useState } from "react";

const STORAGE_KEY = "morphy_username";

function normalizeUsername(raw) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

// localStorage throws in some contexts (Safari private mode, sandboxed
// iframes). Degrade to in-memory only rather than crashing the app.
function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* in-memory only */
  }
}

const UsernameContext = createContext(null);

export function UsernameProvider({ children }) {
  const [username, setUsernameState] = useState(
    () => storageGet(STORAGE_KEY) ?? "",
  );

  const setUsername = useCallback((next) => {
    const normalized = normalizeUsername(next);
    setUsernameState(normalized);
    storageSet(STORAGE_KEY, normalized);
    return normalized;
  }, []);

  const clearUsername = useCallback(() => {
    setUsername("");
  }, [setUsername]);

  const value = useMemo(
    () => ({ username, setUsername, clearUsername, normalizeUsername }),
    [username, setUsername, clearUsername],
  );

  return (
    <UsernameContext.Provider value={value}>{children}</UsernameContext.Provider>
  );
}

export function useUsername() {
  const ctx = useContext(UsernameContext);
  if (!ctx) throw new Error("useUsername must be used within UsernameProvider");
  return ctx;
}

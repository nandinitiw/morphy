import { createContext, useCallback, useContext, useState } from "react";

import { fetchIngestStatus, triggerIngest, warmBackend } from "../api/client.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The free Render instance can briefly blip (cold start) or restart outright
// (OOM / CPU starvation) mid-analysis. A single failed poll must not be treated
// as "analysis failed" — retry transient errors, and only give up after several
// consecutive failures, with an honest message about what actually happened.
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

class JobLostError extends Error {}

async function pollJob(jobId, onUpdate) {
  let consecutiveErrors = 0;
  while (true) {
    let job;
    try {
      job = await fetchIngestStatus(jobId);
    } catch (err) {
      consecutiveErrors += 1;
      // A 404 means the server no longer has this job — almost always because
      // the free instance restarted and wiped its in-memory SQLite mid-run.
      if (/\b404\b/.test(err.message)) {
        throw new JobLostError(
          "The free server restarted and lost this analysis run before it " +
            "finished. This can happen on long runs; click Refresh to try again.",
        );
      }
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        throw err;
      }
      await sleep(3000);
      continue;
    }
    consecutiveErrors = 0;
    onUpdate(job);
    if (job.status === "completed" || job.status === "failed") {
      return job;
    }
    await sleep(2000);
  }
}

const IngestContext = createContext(null);

export function IngestProvider({ children }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [warming, setWarming] = useState(false);
  const [startedAt, setStartedAt] = useState(null);

  const startIngest = useCallback(async (username) => {
    setError("");
    setIsRunning(true);
    setStartedAt(Date.now());
    try {
      // Free-tier cold start: wait for the instance to boot before the first
      // real request, so a sleeping server shows "waking up" instead of a scary
      // "cannot reach backend" on the first click.
      setWarming(true);
      const up = await warmBackend();
      setWarming(false);
      if (!up) {
        throw new Error(
          "The analysis server is taking too long to wake up (free tier). " +
            "Give it a moment and try again.",
        );
      }

      const created = await triggerIngest(username);
      setJob(created);
      const finalJob = await pollJob(created.job_id, setJob);
      if (finalJob.status === "failed") {
        setError(finalJob.error ?? "Analysis failed");
      }
      return finalJob;
    } catch (err) {
      setError(err.message ?? "Could not reach the backend");
      throw err;
    } finally {
      setWarming(false);
      setIsRunning(false);
    }
  }, []);

  const clearJob = useCallback(() => {
    setJob(null);
    setError("");
    setStartedAt(null);
  }, []);

  const value = { job, error, isRunning, warming, startedAt, startIngest, clearJob };

  return <IngestContext.Provider value={value}>{children}</IngestContext.Provider>;
}

export function useIngest() {
  const ctx = useContext(IngestContext);
  if (!ctx) throw new Error("useIngest must be used within IngestProvider");
  return ctx;
}

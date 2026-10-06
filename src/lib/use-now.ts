"use client";

import { useEffect, useState } from "react";

/**
 * A ticking "now" for components whose rendered state depends on wall-clock
 * time (e.g. pick locking at kickoff). Without this, a game that starts while
 * the page is open would keep rendering with the `Date.now()` captured at the
 * last render and never visually lock.
 *
 * Also snaps forward immediately when the tab becomes visible again so state
 * that went stale while backgrounded corrects itself on the next paint.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };

    const intervalId = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return now;
}

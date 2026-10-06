"use client";

import { useEffect } from "react";

/**
 * Demo stand-in for a real scheduled worker: there's no background job host
 * here, so an open tab opportunistically pings the sweep endpoint (stale
 * session settlement, subscription accrual, campaign deadlines, popularity
 * recompute) every 20 seconds. Every one of those operations is independently
 * idempotent, so overlapping or missed ticks are harmless.
 */
export function CronPing() {
  useEffect(() => {
    const tick = () => {
      fetch("/api/cron/sweep", { method: "POST" }).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, []);
  return null;
}

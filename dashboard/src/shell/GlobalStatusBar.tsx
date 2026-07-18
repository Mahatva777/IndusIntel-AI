/**
 * GlobalStatusBar — always visible (architecture §8).
 *
 * Displays plant status overview: operational state badge, active incident
 * count, system health indicator, connection status, and current time.
 * Uses shared UI primitives (Badge, StatusBadge, Typo) for consistent
 * §16 semantic rendering.
 */
import React, { useState } from "react";
import { useDashboardStatus } from "../derived/selectors";
import { useVisibleIncidents } from "../derived/selectors";
import { useCrossPanelInteractions } from "../shared/hooks/useCrossPanelInteractions";
import { Typo } from "../shared/ui/Typography";
import { Badge } from "../shared/ui/Badge";
import { StatusBadge } from "../shared/ui/StatusBadge";
import type { DashboardOperationalState } from "../derived/selectors";

const STATE_BADGE_CLASS: Record<DashboardOperationalState, string> = {
  Normal:    "bg-severity-normal/20 text-severity-normal border-severity-normal/40",
  Elevated:  "bg-severity-critical/20 text-severity-critical border-severity-critical/40",
  Emergency: "bg-severity-emergency/20 text-severity-emergency border-severity-emergency/40",
};

export function GlobalStatusBar() {
  const { operationalState, infrastructureHealthy } = useDashboardStatus();
  const incidents = useVisibleIncidents();
  const { onWorkerClick } = useCrossPanelInteractions();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Global Search -> Navigate to worker context
      onWorkerClick(searchQuery.trim());
      document.getElementById("panel-worker-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setSearchQuery("");
    }
  };

  return (
    <header className="
      flex items-center justify-between
      h-12 px-4
      bg-[var(--color-surface-raised)]
      border-b border-[var(--color-border-subtle)]
      shrink-0
    ">
      {/* Left: plant identity + operational state */}
      <div className="flex items-center gap-3">
        <Typo level={5} className="text-slate-200 font-semibold tracking-wider uppercase">
          IndusIntel
        </Typo>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-type-6 font-semibold ${STATE_BADGE_CLASS[operationalState]}`}>
          {operationalState}
        </span>
      </div>

      {/* Center: active incident count & Global Search */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1.5">
          <Typo level={6}>Active Incidents</Typo>
          <Badge type="numeric">{incidents.length}</Badge>
        </div>

        {/* Demo Trigger */}
        <button
          onClick={() => fetch("http://localhost:8081/debug/start-csv-demo", { method: "POST" })}
          className="px-3 py-1 rounded bg-blue-600 text-white font-industrial text-xs hover:bg-blue-500 transition-colors"
        >
          Run CSV Demo
        </button>

        {/* Global Search (§12.2 Search Worker) */}
        <form onSubmit={handleSearch} className="flex items-center">
          <input
            type="text"
            placeholder="Search Worker ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="
              px-2 py-1 rounded-l text-type-6 font-industrial
              bg-slate-800 border border-slate-700
              text-slate-200 placeholder:text-slate-500
              focus:outline-none focus:border-slate-500 w-48
            "
          />
          <button
            type="submit"
            className="
              px-2 py-1 rounded-r text-type-6 font-semibold font-industrial
              bg-slate-700 text-slate-200 border border-l-0 border-slate-700
              hover:bg-slate-600 transition-colors
            "
          >
            Search
          </button>
        </form>
      </div>

      {/* Right: system health + clock */}
      <div className="flex items-center gap-4">
        <StatusBadge
          status={infrastructureHealthy ? "Active" : "Unavailable"}
          variant="dot"
        />
        <Typo level={6} className="tabular-nums text-slate-400">
          <ClockDisplay />
        </Typo>
      </div>
    </header>
  );
}

/** Live clock — re-renders every second via RAF. */
function ClockDisplay() {
  const [time, setTime] = React.useState(() => new Date());

  React.useEffect(() => {
    let raf: number;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 1000) {
        setTime(new Date());
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <>{time.toLocaleTimeString()}</>;
}

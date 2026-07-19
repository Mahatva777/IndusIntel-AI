/**
 * TimelinePanel — P4 panel (§16.6).
 *
 * Replay controls per §1.5 Lifetime Policy (Empty → Update → Active → Dispose)
 * and §4.15 Replay Transition sequence:
 *   - Entering replay: sets cursor, suspends live rendering elsewhere (§5.11)
 *   - Exiting replay: resets cursor to null, resyncs to latest snapshot
 *
 * §9.5: "Continue updating" during emergency — timeline keeps appending.
 * No write actions — timeline is read-only.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  useTimelineEvents,
  useTimelineCursorEvent,
} from "../../ui-state/timeline/store";
import { useSelectionState } from "../../ui-state/selection/store";
import { useLayoutState } from "../../shell/LayoutContext";
import { useCrossPanelInteractions } from "../../shared/hooks/useCrossPanelInteractions";
import { Typo, Badge } from "../../shared/ui";
import type { TimelineEvent } from "../../types/entities";

type ReplaySpeed = 1 | 2 | 4;

/** §1.5 Lifetime phases — derived from event count and cursor position. */
type TimelinePhase = "empty" | "updating" | "active" | "replay";

const ENTITY_COLORS: Record<string, string> = {
  Incident:  "bg-severity-emergency",
  Worker:    "bg-severity-advisory",
  Permit:    "bg-severity-warning",
  Telemetry: "bg-severity-normal",
  Camera:    "bg-severity-information",
  System:    "bg-slate-500",
};

// §10.7 Redundant encoding via varying visual weight/height
const ENTITY_HEIGHTS: Record<string, string> = {
  Incident:  "h-full rounded-t-sm",
  Worker:    "h-4/5 rounded-t-sm",
  Permit:    "h-3/4",
  Telemetry: "h-2/3",
  Camera:    "h-1/2",
  System:    "h-1/3",
};



export function TimelinePanel() {
  const allEvents = useTimelineEvents();
  const cursorEvent = useTimelineCursorEvent();
  const { selectedWorkerId } = useSelectionState();
  
  const events = useMemo(() => {
    if (!selectedWorkerId) return allEvents;
    return allEvents.filter(e => {
      const payload = "payload" in e ? (e as { payload?: unknown }).payload as Record<string, unknown> : undefined;
      return (
        (e.entityType === "Worker" && e.entityId === selectedWorkerId) ||
        (payload != null && typeof payload === "object" && (
          payload.workerId === selectedWorkerId ||
          (Array.isArray(payload.workerIds) && payload.workerIds.includes(selectedWorkerId))
        ))
      );
    });
  }, [allEvents, selectedWorkerId]);

  // Virtualization state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [clientWidth, setClientWidth] = useState(800);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setClientWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ITEM_WIDTH = 7;
  const startIndex = Math.max(0, Math.floor(scrollLeft / ITEM_WIDTH) - 10);
  const endIndex = Math.min(events.length, Math.ceil((scrollLeft + clientWidth) / ITEM_WIDTH) + 10);
  const visibleEvents = events.slice(startIndex, endIndex);

  const { operationalState } = useLayoutState();
  const { onTimelineClick } = useCrossPanelInteractions();

  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(1);

  // §1.5 Lifetime Policy phase derivation
  const phase = useMemo<TimelinePhase>(() => {
    if (events.length === 0) return "empty";
    if (cursorEvent) return "replay";
    return "active";
  }, [events.length, cursorEvent]);

  const isReplay = phase === "replay";
  const isEmergency = operationalState === "Emergency";

  // --- Replay controls (§4.15) ---

  const exitReplay = useCallback(() => {
    // §4.15: Exit replay → full resync to latest snapshot
    // -1 is not a valid index, but since we don't have a clear timeline API here for null, we'll
    // either need to ensure onTimelineClick handles special values, or use the direct setTimelineCursor for exit.
    // For now, let's keep the hook pure and pass an invalid index, or add an exit handler to the hook.
    // Given the hook signature, we'll just use the raw setTimelineCursor logic for exit/step, since
    // the matrix only specifies "Click Timeline" -> selects timeline index.
    import("../../ui-state/timeline/store").then(m => m.setTimelineCursor(null));
  }, []);

  const stepForward = useCallback(() => {
    if (!cursorEvent) return;
    const idx = events.findIndex((e) => e.id === cursorEvent.id);
    if (idx < events.length - 1) {
      import("../../ui-state/timeline/store").then(m => m.setTimelineCursor(idx + 1));
    }
  }, [cursorEvent, events]);

  const stepBackward = useCallback(() => {
    if (!cursorEvent) return;
    const idx = events.findIndex((e) => e.id === cursorEvent.id);
    if (idx > 0) {
      import("../../ui-state/timeline/store").then(m => m.setTimelineCursor(idx - 1));
    }
  }, [cursorEvent, events]);

  // --- Empty phase ---
  if (phase === "empty") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 bg-[var(--color-surface-panel)] rounded-lg overflow-hidden border border-[var(--color-border-subtle)]">
        <Typo level={5} className="text-slate-500">Timeline empty</Typo>
        <Typo level={6} className="text-slate-600 mt-1">
          Events will appear as they occur.
        </Typo>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Timeline Panel — event replay and live event stream"
      aria-roledescription="Event timeline"
      className="flex flex-col h-full focus:outline-none focus:ring-2 focus:ring-severity-advisory bg-[var(--color-surface-panel)] rounded-lg overflow-hidden border border-[var(--color-border-subtle)]"
    >
      {/* Header and playback controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2">
          <Typo level={3}>Timeline</Typo>
          <Badge type="numeric">{events.length}</Badge>
          {isReplay && (
            <Badge type="replay">REPLAY</Badge>
          )}
          {isEmergency && !isReplay && (
            <Badge type="severity">LIVE</Badge>
          )}
        </div>

        {/* §4.15 Replay controls */}
        <div className="flex items-center gap-1">
          {isReplay ? (
            <>
              <ReplayButton label="◀◀" onClick={stepBackward} title="Step backward" />
              <ReplayButton label="▶▶" onClick={stepForward} title="Step forward" />
              <select
                value={replaySpeed}
                onChange={(e) => setReplaySpeed(Number(e.target.value) as ReplaySpeed)}
                tabIndex={9}
                aria-label="Playback speed"
                className="
                  px-1.5 py-1 rounded text-type-6 font-industrial
                  bg-slate-700 text-slate-200 border border-slate-600
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
                "
              >
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={4}>4×</option>
              </select>
              <ReplayButton
                label="✕ Exit"
                onClick={exitReplay}
                title="Exit replay — resync to live"
                className="bg-severity-emergency/20 text-severity-emergency hover:bg-severity-emergency/30"
              />
            </>
          ) : (
            <Typo level={6} className="text-slate-500">
              Click an event to enter replay
            </Typo>
          )}
        </div>
      </div>

      {/* §5.11 Replay mode indicator */}
      {isReplay && (
        <div className="px-3 py-1.5 bg-blue-900/20 border-b border-blue-800/30">
          <Typo level={6} className="text-blue-400">
            Replay Mode — live updates buffered, not rendered (§5.11). Exit to resync.
          </Typo>
        </div>
      )}

      {/* Event strip */}
      <div 
        className="flex-1 overflow-x-auto overflow-y-hidden p-3" 
        onScroll={handleScroll} 
        ref={scrollContainerRef}
      >
        <div className="flex items-end h-full" style={{ width: events.length * ITEM_WIDTH, position: "relative" }}>
          {visibleEvents.map((event, localIdx) => {
            const actualIdx = startIndex + localIdx;
            const isCurrent = cursorEvent?.id === event.id;
            const colorClass = ENTITY_COLORS[event.entityType] ?? "bg-slate-500";
            const baseHeightClass = ENTITY_HEIGHTS[event.entityType] ?? "h-2/3";

            return (
              <button
                key={event.id}
                onClick={() => onTimelineClick(actualIdx)}
                tabIndex={9}
                title={`${event.entityType}: ${event.entityId} at ${new Date(event.timestamp).toLocaleTimeString()}`}
                aria-label={`Event ${event.entityType} for ${event.entityId}`}
                style={{ position: "absolute", left: actualIdx * ITEM_WIDTH, width: 6 }}
                className={`
                  h-full transition-all flex-shrink-0
                  focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400
                  ${colorClass}
                  ${isCurrent
                    ? "ring-2 ring-white opacity-100"
                    : isReplay && !isCurrent
                      ? `${baseHeightClass} opacity-30`
                      : `${baseHeightClass} opacity-60 hover:opacity-100 hover:h-full`
                  }
                `}
              />
            );
          })}
        </div>
      </div>

      {/* Current event detail (shown during replay or for latest event) */}
      <div className="px-3 py-2 border-t border-[var(--color-border-subtle)]">
        {cursorEvent ? (
          <EventDetail event={cursorEvent} />
        ) : events.length > 0 ? (
          <EventDetail event={events[events.length - 1]} />
        ) : null}
      </div>
    </div>
  );
}

function EventDetail({ event }: { event: TimelineEvent }) {
  const colorClass = ENTITY_COLORS[event.entityType] ?? "bg-slate-500";
  return (
    <div className="flex items-center gap-3">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorClass}`} />
      <Typo level={5} className="text-slate-200">{event.entityType}</Typo>
      <Typo level={6} className="text-slate-400">{event.entityId}</Typo>
      <Typo level={6} className="text-slate-500 tabular-nums ml-auto">
        {new Date(event.timestamp).toLocaleTimeString()}
      </Typo>
    </div>
  );
}

function ReplayButton({
  label,
  onClick,
  title,
  className = "",
}: {
  label: string;
  onClick: () => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      tabIndex={9}
      aria-label={title}
      className={`
        px-2 py-1 rounded text-type-6 font-semibold font-industrial
        bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
        ${className}
      `}
    >
      {label}
    </button>
  );
}

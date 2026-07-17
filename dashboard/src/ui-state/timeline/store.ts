/**
 * Timeline state slice (§1.3: Timeline Buffer, owner Timeline Controller,
 * user-driven, "Snapshot index" memory strategy). Timeline Events are
 * append-only once recorded (Appendix A) — `recordTimelineEvent` is the
 * only way new events enter this slice; `setTimelineCursor` is the only
 * way the scrub/replay position changes. Only the functions exported here
 * mutate this slice (§1.1).
 */
import { create } from "zustand";
import {
  createTimelineBufferState,
  getEventAtCursor,
  getEventsUpToCursor,
  pushTimelineEvent,
  setTimelineCursor as setBufferCursor,
  type TimelineBufferState,
} from "@shared/normalization";
import type { TimelineEvent } from "./types";

/** Snapshot index window size (§1.3 Memory Strategy: "Snapshot index"). */
const TIMELINE_BUFFER_MAX_SIZE = 2000;

const useTimelineInternalStore = create<TimelineBufferState<TimelineEvent>>(() =>
  createTimelineBufferState<TimelineEvent>(TIMELINE_BUFFER_MAX_SIZE),
);

export function recordTimelineEvent(event: TimelineEvent): void {
  useTimelineInternalStore.setState((state) => pushTimelineEvent(state, event));
}

/** Move the scrub cursor; pass null to return to the live tail (§5.11 Replay State). */
export function setTimelineCursor(cursorIndex: number | null): void {
  useTimelineInternalStore.setState((state) => setBufferCursor(state, cursorIndex));
}

export function resetTimelineStore(): void {
  useTimelineInternalStore.setState(createTimelineBufferState<TimelineEvent>(TIMELINE_BUFFER_MAX_SIZE));
}

export function useTimelineEvents(): readonly TimelineEvent[] {
  return useTimelineInternalStore((state) => state.events);
}

export function useTimelineCursorEvent(): TimelineEvent | undefined {
  return useTimelineInternalStore((state) => getEventAtCursor(state));
}

export function useTimelineEventsUpToCursor(): readonly TimelineEvent[] {
  return useTimelineInternalStore((state) => getEventsUpToCursor(state));
}

/** Raw normalized state, for use by the derived selectors module only (§2.9). */
export function useTimelineStoreState(): TimelineBufferState<TimelineEvent> {
  return useTimelineInternalStore((state) => state);
}

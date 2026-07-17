/**
 * Timeline Buffer normalization type (§1.3 Timeline row: Normalization
 * "Timeline Buffer", Memory Strategy "Snapshot index"; §1.4 describes the
 * equivalent conceptual shape as an "Ordered List" for "time-sequential
 * navigation"). Timeline Events are append-only and never edited or
 * deleted once recorded (Appendix A), so this buffer only ever grows at
 * the tail (bounded by `maxSize`, oldest evicted first, matching the
 * "Fixed-size sliding window" rule used for the Replay buffer at §2.10)
 * and exposes a separate cursor for scrubbing/replay position (§9.10
 * "Historical replay ... reproduces the recorded escalationLevel
 * transitions from historical events"; §5.11 Replay State).
 *
 * The cursor is state, not derived — the operator can scrub the timeline
 * independent of which event most recently arrived.
 */
export interface TimelineBufferState<T> {
  /** Oldest first. */
  readonly events: readonly T[];
  readonly maxSize: number;
  /** Index into `events`, or null when not in replay/scrub mode (live tail). */
  readonly cursorIndex: number | null;
}

export function createTimelineBufferState<T>(maxSize: number): TimelineBufferState<T> {
  return { events: [], maxSize, cursorIndex: null };
}

/** Append a new event at the tail, evicting from the head once over capacity. */
export function pushTimelineEvent<T>(state: TimelineBufferState<T>, event: T): TimelineBufferState<T> {
  const combined = [...state.events, event];
  const overflow = combined.length - state.maxSize;
  const events = overflow > 0 ? combined.slice(overflow) : combined;

  // Keep the cursor pointing at the same logical event after eviction, if any.
  const cursorIndex =
    state.cursorIndex === null ? null : Math.max(state.cursorIndex - Math.max(overflow, 0), 0);

  return { ...state, events, cursorIndex };
}

/** Move the scrub cursor. Pass null to return to the live tail. */
export function setTimelineCursor<T>(
  state: TimelineBufferState<T>,
  cursorIndex: number | null,
): TimelineBufferState<T> {
  if (cursorIndex === null) return { ...state, cursorIndex: null };
  const clamped = Math.min(Math.max(cursorIndex, 0), Math.max(state.events.length - 1, 0));
  return { ...state, cursorIndex: clamped };
}

export function getEventAtCursor<T>(state: TimelineBufferState<T>): T | undefined {
  if (state.cursorIndex === null) return undefined;
  return state.events[state.cursorIndex];
}

export function getEventsUpToCursor<T>(state: TimelineBufferState<T>): readonly T[] {
  if (state.cursorIndex === null) return state.events;
  return state.events.slice(0, state.cursorIndex + 1);
}

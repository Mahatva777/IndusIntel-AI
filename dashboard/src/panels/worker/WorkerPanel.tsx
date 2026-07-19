/**
 * WorkerPanel — P4 panel (§16.6).
 *
 * Live worker state display. §9.5: Highlights affected workers during
 * emergencies — workers whose zoneId matches the Primary Incident's zoneId
 * get an emergency ring indicator.
 *
 * Write Action: Worker Notes (§6.3 row 9) — optimistic per §6.2,
 * no confirmation (§6.4), Operator+.
 */
import { useState, useCallback } from "react";
import { useAllWorkers } from "../../domain/worker/store";
import { useLayoutState } from "../../shell/LayoutContext";
import { useOperatorActions } from "../../shared/hooks/useOperatorActions";
import { useCrossPanelInteractions } from "../../shared/hooks/useCrossPanelInteractions";
import { useSelectionState } from "../../ui-state/selection/store";
import { useDashboardStatus } from "../../derived/selectors";
import { useHoverState } from "../../ui-state/hover/store";
import { Typo, StatusBadge, Badge } from "../../shared/ui";

/** Local UI state for worker notes (§5.12 — feature owns local UI state). */
interface LocalNote {
  readonly workerId: string;
  readonly text: string;
  readonly id: string;
}

export function WorkerPanel() {
  const workers = useAllWorkers();
  const { primaryIncident, operationalState } = useLayoutState();
  const { state: actionState, addWorkerNote, clearError } = useOperatorActions();
  const { onWorkerClick, onWorkerHover } = useCrossPanelInteractions();
  const { selectedWorkerId } = useSelectionState();
  const { hoveredWorkerId } = useHoverState();
  const { infrastructureHealthy } = useDashboardStatus();

  // Local optimistic notes store
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [noteInput, setNoteInput] = useState("");

  // Determine affected zone for emergency highlighting
  const affectedZoneId = primaryIncident?.zoneId ?? null;
  const isEmergency = operationalState === "Emergency" || operationalState === "Elevated";

  const handleAddNote = useCallback(() => {
    if (!selectedWorkerId || !noteInput.trim()) return;

    const noteId = crypto.randomUUID();
    const workerId = selectedWorkerId;
    const text = noteInput.trim();

    // §6.2 Optimistic: add immediately, rollback on failure
    const optimisticAdd = () => {
      setNotes((prev) => [...prev, { workerId, text, id: noteId }]);
    };
    const rollbackRemove = () => {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    };

    addWorkerNote(workerId as any, text, optimisticAdd, rollbackRemove);
    setNoteInput("");
  }, [selectedWorkerId, noteInput, addWorkerNote]);

  // --- Empty state ---
  if (workers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 bg-[var(--color-surface-panel)] rounded-lg overflow-hidden border border-[var(--color-border-subtle)]">
        <Typo level={5} className="text-slate-500">No workers on site</Typo>
        <Typo level={6} className="text-slate-600 mt-1">
          Worker data will appear when available.
        </Typo>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Worker Panel — on-site workers and notes"
      aria-roledescription="Worker status panel"
      className={`flex flex-col h-full focus:outline-none focus:ring-2 focus:ring-severity-advisory rounded-lg transition-opacity duration-300 bg-[var(--color-surface-panel)] overflow-hidden border border-[var(--color-border-subtle)] ${!infrastructureHealthy ? "opacity-60 saturate-50" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <Typo level={3}>Workers</Typo>
        <Badge type="numeric">{workers.length}</Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {workers.map((worker) => {
          const isAffected = isEmergency && affectedZoneId && worker.zoneId === affectedZoneId;
          const isSelected = selectedWorkerId === worker.id;
          const isHovered = hoveredWorkerId === worker.id;
          const workerNotes = notes.filter((n) => n.workerId === worker.id);

          return (
            <div key={worker.id}>
              <button
                onClick={() => onWorkerClick(isSelected ? "" : worker.id)}
                onMouseEnter={() => onWorkerHover(worker.id)}
                onMouseLeave={() => onWorkerHover(null)}
                tabIndex={7}
                aria-label={`Worker ${worker.id}, status ${worker.status}${worker.zoneId ? `, zone ${worker.zoneId}` : ""}${isAffected ? ", affected by emergency" : ""}${isSelected ? ", selected" : ""}`}
                aria-pressed={isSelected}
                className={`
                  w-full flex items-center justify-between px-3 py-2 rounded-lg
                  text-left transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
                  ${isAffected
                    ? "bg-severity-emergency/10 ring-1 ring-severity-emergency/30"
                    : isSelected
                      ? "bg-slate-700/50"
                      : isHovered
                        ? "bg-slate-700/30"
                        : "hover:bg-slate-800/50"
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  {/* §9.5: Emergency indicator */}
                  {isAffected && (
                    <span className="inline-block h-2 w-2 rounded-full bg-severity-emergency animate-attention" aria-label="Affected by emergency" />
                  )}
                  <Typo level={5} className="text-slate-200">{worker.id}</Typo>
                  <WorkerStatusBadge status={worker.status} />
                </div>
                <div className="flex items-center gap-2">
                  {worker.zoneId && (
                    <Typo level={6} className="text-slate-500">{String(worker.zoneId)}</Typo>
                  )}
                  {worker.permitId && (
                    <Badge type="status">Permit</Badge>
                  )}
                  {workerNotes.length > 0 && (
                    <Badge type="numeric">{workerNotes.length}</Badge>
                  )}
                </div>
              </button>

              {/* Notes section for selected worker */}
              {isSelected && (
                <div className="ml-4 mt-1 mb-2 pl-3 border-l-2 border-slate-700 space-y-1">
                  {workerNotes.map((note) => (
                    <div key={note.id} className="text-type-6 text-slate-400 font-industrial py-0.5">
                      {note.text}
                    </div>
                  ))}

                  {/* Note input — §6.3 row 9, no confirmation */}
                  <div className="flex gap-1 mt-1">
                    <input
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                      placeholder="Add note..."
                      disabled={!infrastructureHealthy || actionState.loading}
                      tabIndex={7}
                      aria-label={`Add note for worker ${selectedWorkerId}`}
                      className="
                        flex-1 px-2 py-1 rounded
                        text-type-6 font-industrial
                        bg-slate-800 border border-slate-700
                        text-slate-200 placeholder:text-slate-600
                        focus:outline-none focus:border-slate-500
                      "
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={!infrastructureHealthy || actionState.loading || !noteInput.trim()}
                      tabIndex={7}
                      aria-label="Submit worker note"
                      className="
                        px-2 py-1 rounded text-type-6 font-semibold font-industrial
                        bg-status-acknowledged/20 text-status-acknowledged
                        hover:bg-status-acknowledged/30 transition-colors
                        disabled:opacity-40 disabled:cursor-not-allowed
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
                      "
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error banner */}
      {actionState.error && actionState.lastAction === "Worker Notes" && (
        <div className="px-3 py-2 bg-severity-emergency/10 border-t border-severity-emergency/30">
          <div className="flex items-center justify-between">
            <Typo level={6} className="text-severity-emergency">
              Note failed: {actionState.error}
            </Typo>
            <button onClick={clearError} tabIndex={7} aria-label="Dismiss worker note error" className="text-type-6 text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkerStatusBadge({ status }: { status: string }) {
  const mapping: Record<string, "Active" | "Unavailable"> = {
    Active: "Active",
    Idle: "Active",
    Offline: "Unavailable",
  };
  return <StatusBadge status={mapping[status] ?? "Unavailable"} variant="dot" />;
}

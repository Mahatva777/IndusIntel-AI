/**
 * PermitPanel — P4 panel (§16.6).
 *
 * Permit lifecycle display with Suspend/Resume write actions.
 * §6.3 rows 6-7: Pessimistic, confirmation required, Safety Officer+.
 * §6.12: Concurrent-suspend conflict shows "already suspended by [operator]"
 * rather than a generic error, via the conflictInfo field on ActionState.
 */
import { useState, useCallback } from "react";
import { useAllPermits } from "../../domain/permit/store";
import { useSelectionState } from "../../ui-state/selection/store";
import { useOperatorActions } from "../../shared/hooks/useOperatorActions";
import { useDashboardStatus } from "../../derived/selectors";
import { Typo, StatusBadge, Badge, ConfirmDialog } from "../../shared/ui";
import type { Permit, PermitStatus } from "../../types/entities";

type ConfirmAction = { type: "suspend" | "resume"; permitId: string } | null;

export function PermitPanel() {
  const allPermits = useAllPermits();
  const { selectedWorkerId } = useSelectionState();
  const { infrastructureHealthy } = useDashboardStatus();
  const permits = selectedWorkerId ? allPermits.filter(p => p.workerId === selectedWorkerId) : allPermits;
  const {
    state: actionState,
    clearError,
    suspendPermit,
    resumePermit,
  } = useOperatorActions();

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const onRefresh = useCallback(() => {}, []);

  const handleConfirmed = useCallback(() => {
    if (!confirmAction) return;
    if (confirmAction.type === "suspend") {
      suspendPermit(confirmAction.permitId as any, onRefresh);
    } else {
      resumePermit(confirmAction.permitId as any, onRefresh);
    }
    setConfirmAction(null);
  }, [confirmAction, suspendPermit, resumePermit, onRefresh]);

  // --- Empty state ---
  if (permits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <Typo level={5} className="text-slate-500">No active permits</Typo>
        <Typo level={6} className="text-slate-600 mt-1">
          Permit data will appear when available.
        </Typo>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Permit Panel — active permits and lifecycle actions"
      aria-roledescription="Permit management panel"
      className={`flex flex-col h-full focus:outline-none focus:ring-2 focus:ring-severity-advisory rounded-lg transition-opacity duration-300 ${!infrastructureHealthy ? "opacity-60 saturate-50" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <Typo level={3}>Permits</Typo>
        <Badge type="numeric">{permits.length}</Badge>
      </div>

      {/* Permit list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {permits.map((permit) => (
          <PermitRow
            key={permit.id}
            permit={permit}
            loading={actionState.loading}
            infrastructureHealthy={infrastructureHealthy}
            onSuspend={() => setConfirmAction({ type: "suspend", permitId: permit.id })}
            onResume={() => setConfirmAction({ type: "resume", permitId: permit.id })}
          />
        ))}
      </div>

      {/* §6.12: Concurrent conflict info — specific message, not generic error */}
      {actionState.conflictInfo && (
        <div className="px-3 py-2 bg-severity-warning/10 border-t border-severity-warning/30">
          <div className="flex items-center justify-between">
            <Typo level={5} className="text-severity-warning">
              {actionState.conflictInfo}
            </Typo>
            <button onClick={clearError} className="text-type-6 text-slate-400 hover:text-slate-200">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Generic error (non-conflict) */}
      {actionState.error && !actionState.conflictInfo && (
        <div className="px-3 py-2 bg-severity-emergency/10 border-t border-severity-emergency/30">
          <div className="flex items-center justify-between">
            <Typo level={6} className="text-severity-emergency">
              {actionState.lastAction} failed: {actionState.error}
            </Typo>
            <button onClick={clearError} className="text-type-6 text-slate-400 hover:text-slate-200">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* §6.4: Confirmation dialog for Suspend/Resume */}
      <ConfirmDialog
        open={confirmAction !== null}
        actionName={confirmAction?.type === "suspend" ? "Suspend Permit" : "Resume Permit"}
        message={
          confirmAction?.type === "suspend"
            ? `This will suspend permit ${confirmAction.permitId}. All work under this permit must stop immediately. This action will be audited.`
            : `This will resume permit ${confirmAction?.permitId}. Work may recommence under this permit. This action will be audited.`
        }
        variant={confirmAction?.type === "suspend" ? "danger" : "warning"}
        onConfirm={handleConfirmed}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

function PermitRow({
  permit,
  loading,
  infrastructureHealthy,
  onSuspend,
  onResume,
}: {
  permit: Permit;
  loading: boolean;
  infrastructureHealthy: boolean;
  onSuspend: () => void;
  onResume: () => void;
}) {
  const isSuspended = permit.status === "Suspended";
  const isActive = permit.status === "Active" || permit.status === "Resumed";
  const isClosed = permit.status === "Closed";

  return (
    <div
      className={`
        flex items-center justify-between px-3 py-2 rounded-lg border
        ${isSuspended
          ? "bg-severity-warning/5 border-severity-warning/20"
          : "bg-slate-800/50 border-slate-700"
        }
      `}
      role="listitem"
      aria-label={`Permit ${permit.id}, status ${permit.status}, worker ${permit.workerId}`}
    >
      <div className="flex items-center gap-2">
        <Typo level={5} className="text-slate-200">{permit.id}</Typo>
        <PermitStatusBadge status={permit.status} />
      </div>

      <div className="flex items-center gap-2">
        <Typo level={6} className="text-slate-500">
          Worker: {String(permit.workerId)}
        </Typo>
        <Typo level={6} className="text-slate-500">
          Equip: {String(permit.equipmentId)}
        </Typo>

        {/* Suspend/Resume actions — §6.3 rows 6-7 */}
        {isActive && (
          <button
            onClick={onSuspend}
            disabled={!infrastructureHealthy || loading}
            tabIndex={8}
            aria-label={`Suspend permit ${permit.id}`}
            className="
              px-2 py-1 rounded text-type-6 font-semibold font-industrial
              bg-severity-warning/20 text-severity-warning
              hover:bg-severity-warning/30 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
              focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
            "
          >
            Suspend
          </button>
        )}
        {isSuspended && (
          <button
            onClick={onResume}
            disabled={!infrastructureHealthy || loading}
            tabIndex={8}
            aria-label={`Resume permit ${permit.id}`}
            className="
              px-2 py-1 rounded text-type-6 font-semibold font-industrial
              bg-status-active/20 text-status-active
              hover:bg-status-active/30 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
              focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
            "
          >
            Resume
          </button>
        )}
        {isClosed && (
          <Badge type="status">Closed</Badge>
        )}
      </div>
    </div>
  );
}

function PermitStatusBadge({ status }: { status: PermitStatus }) {
  const mapping: Record<PermitStatus, "Active" | "Suspended" | "Resumed" | "Closed"> = {
    Active: "Active",
    Suspended: "Suspended",
    Resumed: "Resumed",
    Closed: "Closed",
  };
  return <StatusBadge status={mapping[status]} variant="pill" />;
}

/**
 * useOperatorActions — React hook wrapping the §6 Write Path.
 *
 * Instantiates WriteExecutor + OperatorActions with a default operator
 * context and manages loading/error state for all write actions.
 *
 * No panel code ever calls store mutators directly — everything flows
 * through this hook (§6.11 rule 3: "Backend is the source of truth
 * for all mutations").
 */
import { useState, useMemo, useCallback } from "react";
import { WriteExecutor } from "../../domain/write-path/executor";
import { OperatorActions } from "../../domain/write-path/actions";
import type { Role } from "../../domain/write-path/types";
import type { IncidentId, PermitId, WorkerId } from "../../types/ids";
import { asId } from "../normalization/id";
import { useDashboardStatus } from "../../derived/selectors";
import { getIncidentStoreSnapshot } from "../../domain/incident/store";
import { getPermitStoreSnapshot } from "../../domain/permit/store";

/** Default operator context — in production, this would come from an auth provider. */
const DEFAULT_CONTEXT = {
  operatorId: asId<"Worker">("OP-001"),
  roles: new Set<Role>(["Operator", "ShiftSupervisor", "SafetyOfficer", "PlantManager"]),
};

export interface ActionState {
  readonly loading: boolean;
  readonly error: string | null;
  readonly lastAction: string | null;
  /**
   * §6.12: When a concurrent conflict is detected (e.g. "already suspended
   * by another operator"), this field carries the conflict description so
   * the UI can show a specific message rather than a generic error.
   */
  readonly conflictInfo: string | null;
}

export function useOperatorActions() {
  const { infrastructureHealthy } = useDashboardStatus();
  const [state, setState] = useState<ActionState>({
    loading: false,
    error: null,
    lastAction: null,
    conflictInfo: null,
  });

  const actions = useMemo(() => {
    const executor = new WriteExecutor(DEFAULT_CONTEXT);
    return new OperatorActions(executor);
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null, conflictInfo: null }));
  }, []);

  /**
   * Wraps any write action with loading/error management.
   * The confirmation dialog is handled by the calling component
   * (it decides whether to show the dialog BEFORE calling this).
   */
  const execute = useCallback(
    async (actionName: string, fn: () => Promise<unknown>) => {
      // §11.2 Action Availability Matrix: all write actions disabled if offline
      if (!infrastructureHealthy) {
        setState({ loading: false, error: "Network connection lost. Offline mode active.", lastAction: actionName, conflictInfo: null });
        return;
      }

      setState({ loading: true, error: null, lastAction: actionName, conflictInfo: null });
      try {
        await fn();
        setState({ loading: false, error: null, lastAction: actionName, conflictInfo: null });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setState({ loading: false, error: message, lastAction: actionName, conflictInfo: null });
      }
    },
    [infrastructureHealthy],
  );

  // --- Incident actions ---

  const acknowledgeAlert = useCallback(
    (incidentId: IncidentId, onRefresh: () => void) =>
      execute("Acknowledge Alert", () => actions.acknowledgeAlert(incidentId, onRefresh)),
    [actions, execute],
  );

  const escalateIncident = useCallback(
    (incidentId: IncidentId, onRefresh: () => void) => {
      const incident = getIncidentStoreSnapshot().incidents.byId[incidentId];
      const currentLevel = incident ? incident.escalationLevel : "None";
      return execute("Escalate Incident", () =>
        actions.escalateIncident(incidentId, currentLevel as any, onRefresh, onRefresh),
      );
    },
    [actions, execute],
  );

  const silenceAlert = useCallback(
    (incidentId: IncidentId, onRefresh: () => void) =>
      execute("Silence Alert", () => actions.silenceAlert(incidentId, onRefresh)),
    [actions, execute],
  );

  const closeIncident = useCallback(
    (incidentId: IncidentId, onRefresh: () => void) =>
      execute("Close Incident", () => actions.closeIncident(incidentId, onRefresh)),
    [actions, execute],
  );

  const dispatchResponse = useCallback(
    (incidentId: IncidentId, onRefresh: () => void) =>
      execute("Dispatch Response", () => actions.dispatchResponse(incidentId, onRefresh)),
    [actions, execute],
  );

  // --- Permit actions (§6.3 rows 6-7, §6.12 concurrent conflict) ---

  const suspendPermit = useCallback(
    (permitId: PermitId, onRefresh: () => void) => {
      const permit = getPermitStoreSnapshot().permits.byId[permitId];
      const currentStatus = permit ? permit.status : "Active";
      const onConflictRefresh = () => {
        setState((s) => ({
          ...s,
          loading: false,
          conflictInfo: `Permit ${permitId} was already suspended by another operator.`,
        }));
      };
      return execute("Suspend Permit", () =>
        actions.suspendPermit(permitId, currentStatus as any, onRefresh, onConflictRefresh),
      );
    },
    [actions, execute],
  );

  const resumePermit = useCallback(
    (permitId: PermitId, onRefresh: () => void) => {
      const permit = getPermitStoreSnapshot().permits.byId[permitId];
      const currentStatus = permit ? permit.status : "Suspended";
      const onConflictRefresh = () => {
        setState((s) => ({
          ...s,
          loading: false,
          conflictInfo: `Permit ${permitId} was already resumed by another operator.`,
        }));
      };
      return execute("Resume Permit", () =>
        actions.resumePermit(permitId, currentStatus as any, onRefresh, onConflictRefresh),
      );
    },
    [actions, execute],
  );

  // --- Worker actions (§6.3 row 9, optimistic per §6.2) ---

  const addWorkerNote = useCallback(
    (workerId: WorkerId, note: string, optimisticAdd: () => void, rollbackRemove: () => void) =>
      execute("Worker Notes", () =>
        actions.addWorkerNote(workerId, note, optimisticAdd, rollbackRemove),
      ),
    [actions, execute],
  );

  return {
    state,
    clearError,
    // Incident
    acknowledgeAlert,
    escalateIncident,
    silenceAlert,
    closeIncident,
    dispatchResponse,
    // Permit
    suspendPermit,
    resumePermit,
    // Worker
    addWorkerNote,
  };
}

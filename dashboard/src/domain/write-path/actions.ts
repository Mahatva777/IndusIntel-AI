import { WriteExecutor } from "./executor";
import { ROLE_HIERARCHY, BackendError } from "./types";
import type { IncidentId, PermitId, WorkerId } from "../../types/ids";

async function doFetch(url: string, correlationId: string, payload: unknown) {
  const res = await fetch(`http://localhost:8000/api/action/${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-ID": correlationId,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    if (res.status === 409 && errorData.isVersionConflict) {
      throw new BackendError({
        code: "CONFLICT",
        message: "Concurrency conflict detected",
        classification: "Permanent",
        isVersionConflict: true,
      });
    }
    throw new BackendError({
      code: "FETCH_ERROR",
      message: errorData.error || errorData.message || `HTTP ${res.status}`,
      classification: res.status >= 500 ? "Transient" : "Permanent",
    });
  }
  return res.json();
}

/**
 * Encapsulates the 9 Operator Actions from §6.3.
 * Each method strictly enforces the required confirmation, update model, and permissions.
 * The `executeBackend` mocks the API call and must be replaced when the network layer is ready.
 */
export class OperatorActions {
  constructor(private readonly executor: WriteExecutor) {}

  /** 1. Acknowledge Alert (Pessimistic, No Conf, Operator+) */
  async acknowledgeAlert(incidentId: IncidentId, onRefresh: () => void) {
    return this.executor.execute({
      actionName: "Acknowledge Alert",
      targetEntityId: incidentId,
      updateModel: "Pessimistic",
      requiredRoles: ROLE_HIERARCHY["Operator+"],
      requiresConfirmation: false,
      payload: { incidentId },
      executeBackend: async (correlationId) => doFetch("acknowledge-alert", correlationId, { incidentId }),
      pessimisticRefresh: onRefresh,
    });
  }

  /** 2. Escalate Incident (Pessimistic, Conf required, Supervisor+) */
  async escalateIncident(incidentId: IncidentId, currentVersion: number, onRefresh: () => void, onConflictRefresh: () => void) {
    return this.executor.execute({
      actionName: "Escalate Incident",
      targetEntityId: incidentId,
      updateModel: "Pessimistic",
      requiredRoles: ROLE_HIERARCHY["Supervisor+"],
      requiresConfirmation: true,
      payload: { incidentId, expectedVersion: currentVersion },
      executeBackend: async (correlationId) => doFetch("escalate-incident", correlationId, { incidentId, expectedEscalationLevel: currentVersion }),
      pessimisticRefresh: onRefresh,
      conflictRefresh: onConflictRefresh,
    });
  }
  
  /** 3. Silence Alert (Pessimistic, Conf required, Supervisor+) */
  async silenceAlert(incidentId: IncidentId, onRefresh: () => void) {
    return this.executor.execute({
      actionName: "Silence Alert",
      targetEntityId: incidentId,
      updateModel: "Pessimistic",
      requiredRoles: ROLE_HIERARCHY["Supervisor+"],
      requiresConfirmation: true,
      payload: { incidentId },
      executeBackend: async (correlationId) => doFetch("silence-alert", correlationId, { incidentId }),
      pessimisticRefresh: onRefresh,
    });
  }
  
  /** 4. Open Incident (Pessimistic, No Conf, Operator+) */
  async openIncident(details: Record<string, unknown>, onRefresh: (newId: string) => void) {
    return this.executor.execute({
      actionName: "Open Incident",
      targetEntityId: "new",
      updateModel: "Pessimistic",
      requiredRoles: ROLE_HIERARCHY["Operator+"],
      requiresConfirmation: false,
      payload: { details },
      executeBackend: async (correlationId) => doFetch("open-incident", correlationId, { details }),
      pessimisticRefresh: (res) => onRefresh(res.newIncidentId),
    });
  }
  
  /** 5. Close Incident (Pessimistic, Conf required, Supervisor+) */
  async closeIncident(incidentId: IncidentId, onRefresh: () => void) {
    return this.executor.execute({
      actionName: "Close Incident",
      targetEntityId: incidentId,
      updateModel: "Pessimistic",
      requiredRoles: ROLE_HIERARCHY["Supervisor+"],
      requiresConfirmation: true,
      payload: { incidentId },
      executeBackend: async (correlationId) => doFetch("close-incident", correlationId, { incidentId }),
      pessimisticRefresh: onRefresh,
    });
  }
  
  /** 6. Suspend Permit (Pessimistic, Conf required, Safety Officer+) */
  async suspendPermit(permitId: PermitId, currentVersion: number, onRefresh: () => void, onConflictRefresh: () => void) {
    return this.executor.execute({
      actionName: "Suspend Permit",
      targetEntityId: permitId,
      updateModel: "Pessimistic",
      requiredRoles: ROLE_HIERARCHY["SafetyOfficer+"],
      requiresConfirmation: true,
      payload: { permitId, expectedVersion: currentVersion },
      executeBackend: async (correlationId) => doFetch("suspend-permit", correlationId, { permitId, expectedStatus: currentVersion }),
      pessimisticRefresh: onRefresh,
      conflictRefresh: onConflictRefresh,
    });
  }
  
  /** 7. Resume Permit (Pessimistic, Conf required, Safety Officer+) */
  async resumePermit(permitId: PermitId, currentVersion: number, onRefresh: () => void, onConflictRefresh: () => void) {
    return this.executor.execute({
      actionName: "Resume Permit",
      targetEntityId: permitId,
      updateModel: "Pessimistic",
      requiredRoles: ROLE_HIERARCHY["SafetyOfficer+"],
      requiresConfirmation: true,
      payload: { permitId, expectedVersion: currentVersion },
      executeBackend: async (correlationId) => doFetch("resume-permit", correlationId, { permitId, expectedStatus: currentVersion }),
      pessimisticRefresh: onRefresh,
      conflictRefresh: onConflictRefresh,
    });
  }
  
  /** 8. Dispatch Response (Pessimistic, Conf required, Supervisor+) */
  async dispatchResponse(incidentId: IncidentId, onRefresh: () => void) {
    return this.executor.execute({
      actionName: "Dispatch Response",
      targetEntityId: incidentId,
      updateModel: "Pessimistic",
      requiredRoles: ROLE_HIERARCHY["Supervisor+"],
      requiresConfirmation: true,
      payload: { incidentId },
      executeBackend: async (correlationId) => doFetch("dispatch-response", correlationId, { incidentId }),
      pessimisticRefresh: onRefresh,
    });
  }
  
  /** 9. Worker Notes (Optimistic, No Conf, Operator+) */
  async addWorkerNote(workerId: WorkerId, note: string, optimisticAdd: () => void, rollbackRemove: () => void) {
    return this.executor.execute({
      actionName: "Worker Notes",
      targetEntityId: workerId,
      updateModel: "Optimistic",
      requiredRoles: ROLE_HIERARCHY["Operator+"],
      requiresConfirmation: false,
      payload: { workerId, note },
      executeBackend: async (correlationId) => doFetch("worker-notes", correlationId, { workerId, note }),
      optimisticUpdate: optimisticAdd,
      rollbackUpdate: rollbackRemove,
    });
  }
}

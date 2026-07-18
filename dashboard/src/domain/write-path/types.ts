import type { WorkerId } from "../../types/ids";

/** §6.9 Permission Model */
export type Role =
  | "Operator"
  | "ShiftSupervisor"
  | "SafetyOfficer"
  | "PlantManager"
  | "Administrator";

/** 
 * Hierarchical roles definition.
 * - Operator+ means Operator, ShiftSupervisor, SafetyOfficer, PlantManager
 * - Supervisor+ means ShiftSupervisor, SafetyOfficer, PlantManager
 * - SafetyOfficer+ means SafetyOfficer, PlantManager
 */
export const ROLE_HIERARCHY: Record<string, ReadonlySet<Role>> = {
  "Operator+": new Set(["Operator", "ShiftSupervisor", "SafetyOfficer", "PlantManager"]),
  "Supervisor+": new Set(["ShiftSupervisor", "SafetyOfficer", "PlantManager"]),
  "SafetyOfficer+": new Set(["SafetyOfficer", "PlantManager"]),
  "PlantManager": new Set(["PlantManager"]),
};

/** §6.2 Update Model */
export type UpdateModel = "Pessimistic" | "Optimistic" | "Immediate";

/** §6.7 Audit Expectations (Backend persists, Dashboard initiates) */
export interface AuditRecordPayload {
  readonly operatorId: WorkerId;
  readonly timestamp: string; // ISO
  readonly action: string;
  readonly targetEntity: string;
  readonly previousState: unknown;
  readonly newState: unknown;
  readonly correlationId: string;
}

/** Error classification per §3.9 */
export type ErrorClassification = "Transient" | "Permanent";

export interface BackendErrorEnvelope {
  readonly code: string;
  readonly message: string;
  readonly classification: ErrorClassification;
  readonly isVersionConflict?: boolean; // §6.12 Concurrent writes version conflict indicator
}

export class BackendError extends Error {
  constructor(public readonly envelope: BackendErrorEnvelope) {
    super(envelope.message);
    this.name = "BackendError";
  }
}

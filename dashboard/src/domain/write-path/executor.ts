import { Role, UpdateModel, BackendError } from "./types";
import type { WorkerId } from "../../types/ids";

export interface WriteContext {
  readonly operatorId: WorkerId;
  readonly roles: ReadonlySet<Role>;
}

export interface WriteRequest<TPayload, TResponse> {
  readonly actionName: string;
  readonly targetEntityId: string;
  readonly updateModel: UpdateModel;
  readonly requiredRoles: ReadonlySet<Role>;
  readonly requiresConfirmation: boolean;
  readonly payload: TPayload;
  
  // §6.10: Backend Validation & Execute step.
  // In a real app, this would be an API call. Here we mock the contract.
  readonly executeBackend: (correlationId: string, payload: TPayload) => Promise<TResponse>;
  
  // Handlers for state updates (§6.2, §6.6)
  readonly optimisticUpdate?: () => void;
  readonly rollbackUpdate?: () => void;
  readonly pessimisticRefresh?: (response: TResponse) => void;
  readonly conflictRefresh?: () => void;
}

/**
 * Implements §6.10 Write Lifecycle and handles §6.6 Rollback Policy / §6.8 Failure Handling
 */
export class WriteExecutor {
  constructor(private readonly context: WriteContext) {}

  async execute<TPayload, TResponse>(req: WriteRequest<TPayload, TResponse>): Promise<TResponse> {
    // 1. Permission Check (§6.9)
    const hasPermission = Array.from(req.requiredRoles).some(role => this.context.roles.has(role));
    if (!hasPermission) {
      throw new Error(`Permission denied for action: ${req.actionName}`);
    }

    // (UI Validation happens at the caller level, as well as Confirmation UI)
    // Assuming if execution reaches here, confirmation (if required) was already obtained.

    // 2. Correlation ID generation (§3.9)
    const correlationId = crypto.randomUUID();

    // 3. Optimistic Update (if applicable) (§6.2, §6.6)
    if (req.updateModel === "Optimistic" && req.optimisticUpdate) {
      req.optimisticUpdate();
    }

    // 4. Execute with Retry Logic for Transient Failures (§3.9)
    const MAX_RETRIES = 3;
    let attempt = 0;
    
    while (true) {
      attempt++;
      try {
        const response = await req.executeBackend(correlationId, req.payload);
        
        // 5. Audit Log (Conceptual - backend owns persistence §6.7, but correlationId tracks it)
        // In reality we'd dispatch this to backend if they don't do it automatically,
        // but spec says backend persists it. We just ensure it's audited by correlation ID.
        /*
        const auditPayload: AuditRecordPayload = {
          operatorId: this.context.operatorId,
          timestamp: new Date().toISOString(),
          action: req.actionName,
          targetEntity: req.targetEntityId,
          previousState: null,
          newState: req.payload,
          correlationId,
        };
        */

        // 6. State Update & UI Refresh for Pessimistic writes (§6.2)
        if (req.updateModel === "Pessimistic" && req.pessimisticRefresh) {
          req.pessimisticRefresh(response);
        }
        
        return response;
      } catch (error: unknown) {
        if (error instanceof BackendError) {
          // Retry classification per §3.9 (retry only transient)
          if (error.envelope.classification === "Transient" && attempt < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 50 * Math.pow(2, attempt))); // Exponential backoff
            continue; 
          }

          // Handle Rollback per §6.6
          if (req.updateModel === "Optimistic" && req.rollbackUpdate) {
            req.rollbackUpdate();
          }

          // Conflict detection per §6.6 & §6.12
          if (error.envelope.isVersionConflict) {
            if (req.conflictRefresh) {
              req.conflictRefresh();
            }
          }
        } else {
          // Unknown error (network drop without envelope, timeout, etc.)
          if (req.updateModel === "Optimistic" && req.rollbackUpdate) {
            req.rollbackUpdate();
          }
        }
        
        throw error;
      }
    }
  }
}

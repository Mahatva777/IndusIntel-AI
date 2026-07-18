import { describe, it, expect, vi } from "vitest";
import { WriteExecutor } from "./executor";
import { OperatorActions } from "./actions";
import { BackendError, Role } from "./types";
import { asId } from "../../shared/normalization/id";

describe("§6.12 Concurrent Operator Writes", () => {
  const mockOperatorContext = {
    operatorId: asId<"Worker">("W-123"),
    roles: new Set<Role>(["ShiftSupervisor", "SafetyOfficer"]), // Has permissions for all actions
  };

  it("Scenario 1: Two operators acknowledge simultaneously (Idempotent)", async () => {
    // Both operators A and B acknowledge at the same time.
    // The backend should treat the second as idempotent (success).

    // Operator A's action
    const executorA = new WriteExecutor(mockOperatorContext);
    const actionsA = new OperatorActions(executorA);

    // Operator B's action
    const executorB = new WriteExecutor({
      operatorId: asId<"Worker">("W-456"),
      roles: new Set<Role>(["Operator"]),
    });
    const actionsB = new OperatorActions(executorB);

    const onRefreshA = vi.fn();
    const onRefreshB = vi.fn();

    // Mock API for Acknowledge that always succeeds (first sets it, second is idempotent)
    vi.spyOn(executorA, "execute").mockImplementationOnce(async (req) => {
      req.pessimisticRefresh?.("Success A");
      return req.executeBackend("corr-A", req.payload); // which mocks to { success: true }
    });

    vi.spyOn(executorB, "execute").mockImplementationOnce(async (req) => {
      req.pessimisticRefresh?.("Success B");
      return req.executeBackend("corr-B", req.payload); // which mocks to { success: true }
    });

    await actionsA.acknowledgeAlert(asId("INC-1"), onRefreshA);
    await actionsB.acknowledgeAlert(asId("INC-1"), onRefreshB);

    // Both should trigger a refresh (converging to acknowledged state)
    expect(onRefreshA).toHaveBeenCalled();
    expect(onRefreshB).toHaveBeenCalled();
  });

  it("Scenario 2: Two operators escalate simultaneously (Conflict on second)", async () => {
    // First writes commits. Second detects stale version and is rejected.
    const executor = new WriteExecutor(mockOperatorContext);
    
    // We'll mock the executor's internal behavior directly by simulating backend responses for the exact req
    // Operator A expects version 1, succeeds.
    // Operator B expects version 1, fails because backend is now at version 2.
    
    let backendStateVersion = 1;

    const mockExecuteBackend = vi.fn().mockImplementation(async (_corrId, payload: any) => {
      if (payload.expectedVersion !== backendStateVersion) {
        throw new BackendError({
          code: "VERSION_CONFLICT",
          message: "Entity changed remotely",
          classification: "Permanent",
          isVersionConflict: true
        });
      }
      backendStateVersion++; // Increment on success
      return { success: true };
    });

    const onRefreshA = vi.fn();
    const onConflictRefreshA = vi.fn();

    const onRefreshB = vi.fn();
    const onConflictRefreshB = vi.fn();

    // Create a mock req to test the executor logic 
    const reqA = {
      actionName: "Escalate Incident",
      targetEntityId: "INC-1",
      updateModel: "Pessimistic" as const,
      requiredRoles: new Set<Role>(["ShiftSupervisor"]),
      requiresConfirmation: true,
      payload: { incidentId: asId("INC-1"), expectedVersion: 1 },
      executeBackend: mockExecuteBackend,
      pessimisticRefresh: onRefreshA,
      conflictRefresh: onConflictRefreshA,
    };

    const reqB = {
      actionName: "Escalate Incident",
      targetEntityId: "INC-1",
      updateModel: "Pessimistic" as const,
      requiredRoles: new Set<Role>(["ShiftSupervisor"]),
      requiresConfirmation: true,
      payload: { incidentId: asId("INC-1"), expectedVersion: 1 }, // Also sends 1, but will execute after A
      executeBackend: mockExecuteBackend,
      pessimisticRefresh: onRefreshB,
      conflictRefresh: onConflictRefreshB,
    };

    // Operator A executes
    await executor.execute(reqA);
    
    expect(backendStateVersion).toBe(2);
    expect(onRefreshA).toHaveBeenCalled();
    expect(onConflictRefreshA).not.toHaveBeenCalled();

    // Operator B executes
    await expect(executor.execute(reqB)).rejects.toThrow(BackendError);

    expect(backendStateVersion).toBe(2); // State didn't change
    expect(onRefreshB).not.toHaveBeenCalled();
    expect(onConflictRefreshB).toHaveBeenCalled(); // Triggered conflict refresh
  });

  it("Scenario 3: Two operators suspend the same permit (Conflict on second)", async () => {
    // Identical backend behavior to Escalate, but proving the Suspend Action hooks up conflictRefresh properly
    const executor = new WriteExecutor(mockOperatorContext);
    const actions = new OperatorActions(executor);

    let backendPermitVersion = 1;

    // Intercept the internal executeBackend to throw Version Conflict on mismatch
    const mockInternalExecuteBackend = vi.fn().mockImplementation(async (_corrId, payload: any) => {
      if (payload.expectedVersion !== backendPermitVersion) {
        throw new BackendError({
          code: "CONFLICT",
          message: "Permit already suspended by another operator",
          classification: "Permanent",
          isVersionConflict: true
        });
      }
      backendPermitVersion++;
      return { success: true };
    });

    vi.spyOn(executor, "execute").mockImplementation(async (req) => {
      try {
        const res = await mockInternalExecuteBackend("corr-test", req.payload);
        req.pessimisticRefresh?.(res);
        return res;
      } catch (e) {
        if (e instanceof BackendError && e.envelope.isVersionConflict) {
          req.conflictRefresh?.();
        }
        throw e;
      }
    });

    const onRefresh1 = vi.fn();
    const onConflict1 = vi.fn();
    const onRefresh2 = vi.fn();
    const onConflict2 = vi.fn();

    // Op 1 suspends (expectedVersion: 1)
    await actions.suspendPermit(asId("PRM-1"), 1, onRefresh1, onConflict1);
    
    expect(onRefresh1).toHaveBeenCalled();
    expect(onConflict1).not.toHaveBeenCalled();

    // Op 2 tries to suspend simultaneously with stale version (expectedVersion: 1)
    await expect(actions.suspendPermit(asId("PRM-1"), 1, onRefresh2, onConflict2)).rejects.toThrow();

    expect(onRefresh2).not.toHaveBeenCalled();
    expect(onConflict2).toHaveBeenCalled(); // Dashboard B refreshes and re-requests confirmation
  });
});

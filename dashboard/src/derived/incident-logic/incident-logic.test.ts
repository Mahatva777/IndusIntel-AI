import { describe, it, expect } from "vitest";
import type { Incident } from "../../types/entities";
import { asId } from "../../shared/normalization/id";
import { compareIncidentPriority, deriveAlarmPriority, selectPrimaryIncident } from "./prioritization";
import { deriveDashboardState } from "./operational-state";
import { groupAlarms } from "./alarm-flood";

describe("§8 Incident Prioritization", () => {
  const baseIncident: Incident = {
    id: asId("INC-BASE"),
    severity: "Low",
    status: "Active",
    zoneId: asId("Z-1"),
    createdAt: "2024-01-01T00:00:00Z",
    riskScore: 10,
    confidenceScore: 0.9,
    escalationLevel: "None",
    acknowledgedBy: null,
    resolvedAt: null,
    workerIds: [],
    permitIds: [],
    evidenceIds: [],
    recommendationIds: [],
  };

  it("sorts by Severity first (§8.2, §8.3)", () => {
    const critical: Incident = { ...baseIncident, id: asId("INC-1"), severity: "Critical" };
    const high: Incident = { ...baseIncident, id: asId("INC-2"), severity: "High" };
    
    // compareIncidentPriority returns < 0 if a is higher priority
    expect(compareIncidentPriority(critical, high)).toBeLessThan(0);
  });

  it("breaks ties with Risk Score (§8.2)", () => {
    const incA: Incident = { ...baseIncident, id: asId("INC-A"), severity: "High", riskScore: 50 };
    const incB: Incident = { ...baseIncident, id: asId("INC-B"), severity: "High", riskScore: 40 };
    
    expect(compareIncidentPriority(incA, incB)).toBeLessThan(0);
  });

  it("selects exactly one primary incident deterministically (§8.1, §8.6)", () => {
    const incA: Incident = { ...baseIncident, id: asId("INC-1"), severity: "Medium" };
    const incB: Incident = { ...baseIncident, id: asId("INC-2"), severity: "Emergency" }; // Should win
    const incC: Incident = { ...baseIncident, id: asId("INC-3"), severity: "High" };
    const incD: Incident = { ...baseIncident, id: asId("INC-4"), severity: "Emergency", status: "Resolved" }; // Inactive

    const primary = selectPrimaryIncident([incA, incB, incC, incD]);
    expect(primary?.id).toBe("INC-2");
  });

  it("derives alarm priority strictly from severity (§8.10)", () => {
    expect(deriveAlarmPriority("Emergency")).toBe("P1");
    expect(deriveAlarmPriority("Critical")).toBe("P2");
    expect(deriveAlarmPriority("Medium")).toBe("P4");
  });
});

describe("§9.11 Derivation Chain Integrity", () => {
  it("forces global operational state to follow the Primary Incident", () => {
    const emergencyIncident: Incident = {
      id: asId("INC-E"),
      severity: "Emergency",
      status: "Active",
      zoneId: asId("Z-1"),
      createdAt: "2024-01-01T00:00:00Z",
      riskScore: 10,
      confidenceScore: 0.9,
      escalationLevel: "Reminder",
      acknowledgedBy: null,
      resolvedAt: null,
      workerIds: [],
      permitIds: [],
      evidenceIds: [],
      recommendationIds: [],
    };

    const state = deriveDashboardState(emergencyIncident);
    
    // Testing the strict one-way derivation chain
    expect(state.operationalState).toBe("Emergency");
    expect(state.autoFocusEnabled).toBe(true);
    expect(state.emergencyBannerVisible).toBe(true);
    expect(state.panelsExpanded).toBe(true);
    
    // §9.10 Escalation Level passes through directly
    expect(state.escalationLevel).toBe("Reminder");
  });

  it("gracefully degrades when no primary incident exists", () => {
    const state = deriveDashboardState(null);
    expect(state.operationalState).toBe("Normal");
    expect(state.autoFocusEnabled).toBe(false);
    expect(state.emergencyBannerVisible).toBe(false);
    expect(state.panelsExpanded).toBe(false);
    expect(state.escalationLevel).toBe("None");
  });
});

describe("§7 Alarm Flood Strategy", () => {
  it("groups active incidents and assigns a primary alarm per group", () => {
    const inc1: Incident = {
      id: asId("INC-1"),
      severity: "High",
      status: "Active",
      zoneId: asId("Z-1"), // Same zone
      createdAt: "2024-01-01T00:00:00Z",
      riskScore: 10,
      confidenceScore: 0.9,
      escalationLevel: "None",
      acknowledgedBy: null,
      resolvedAt: null,
      workerIds: [],
      permitIds: [],
      evidenceIds: [],
      recommendationIds: [],
    };

    const inc2: Incident = {
      ...inc1,
      id: asId("INC-2"),
      severity: "Medium", // Lower severity in same zone
      zoneId: asId("Z-1"),
    };

    const inc3: Incident = {
      ...inc1,
      id: asId("INC-3"),
      severity: "Emergency", // P1 alarms group by incident, not zone
      zoneId: asId("Z-1"),
    };

    const groups = groupAlarms([inc1, inc2, inc3]);

    // inc1 & inc2 should group by Zone (Z-1)
    // inc3 should group by Incident (INC-3) because it's P1
    expect(groups).toHaveLength(2);

    const emergencyGroup = groups.find(g => g.groupBy === "Incident");
    expect(emergencyGroup?.primaryAlarmIncident.id).toBe("INC-3");

    const zoneGroup = groups.find(g => g.groupBy === "Zone");
    expect(zoneGroup?.alarmCount).toBe(2);
    // inc1 is Higher severity than inc2, so inc1 is the primary alarm for the zone group
    expect(zoneGroup?.primaryAlarmIncident.id).toBe("INC-1");
    expect(zoneGroup?.supportingIncidents[0].id).toBe("INC-2");
  });
});

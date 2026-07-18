import type { Incident, IncidentSeverity, AlarmPriority, EscalationLevel } from "../../types/entities";

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  Emergency: 1,
  Critical: 2,
  High: 3,
  Medium: 4,
  Low: 5,
  Informational: 6,
};

const ESCALATION_RANK: Record<EscalationLevel, number> = {
  PlantManagerEscalated: 5,
  SupervisorEscalated: 4,
  AudibleReminder: 3,
  Reminder: 2,
  None: 1,
  Acknowledged: 0,
};

function hasPermitConflict(incident: Incident): boolean {
  return incident.permitIds.length > 0;
}

/**
 * §8.2-§8.5 Deterministic Decision Matrix.
 * Returns < 0 if a is higher priority, > 0 if b is higher priority.
 */
export function compareIncidentPriority(a: Incident, b: Incident): number {
  if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  }
  if (a.riskScore !== b.riskScore) {
    return b.riskScore - a.riskScore;
  }
  if (ESCALATION_RANK[a.escalationLevel] !== ESCALATION_RANK[b.escalationLevel]) {
    return ESCALATION_RANK[b.escalationLevel] - ESCALATION_RANK[a.escalationLevel];
  }
  if (a.workerIds.length !== b.workerIds.length) {
    return b.workerIds.length - a.workerIds.length;
  }
  const aConflict = hasPermitConflict(a);
  const bConflict = hasPermitConflict(b);
  if (aConflict !== bConflict) {
    return aConflict ? -1 : 1;
  }
  if (a.confidenceScore !== b.confidenceScore) {
    return b.confidenceScore - a.confidenceScore;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function isActiveIncident(incident: Incident): boolean {
  return incident.status === "Active";
}

/**
 * §8.1/§8.6 Exactly one Primary Incident among currently active incidents, or none.
 */
export function selectPrimaryIncident(incidents: readonly Incident[]): Incident | null {
  const active = incidents.filter(isActiveIncident);
  if (active.length === 0) return null;
  // Sort guarantees deterministic top priority
  return [...active].sort(compareIncidentPriority)[0];
}

/**
 * §8.10 Alarm Priority Mapping
 * Priority is always derived from Severity, never independently assigned.
 */
export function deriveAlarmPriority(severity: IncidentSeverity): AlarmPriority {
  switch (severity) {
    case "Emergency":
      return "P1";
    case "Critical":
      return "P2";
    case "High":
      return "P3";
    case "Medium":
    case "Low":
      return "P4";
    case "Informational":
      return "P5";
  }
}

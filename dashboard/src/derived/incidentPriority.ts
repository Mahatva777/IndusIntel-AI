/**
 * Incident priority ordering — §8.2 Priority Evaluation Order / §8.4
 * Deterministic Decision Matrix / §8.5 Tie-Break Rules. Evaluation stops
 * at the first differentiating attribute (§8.2); the ordering below
 * matches the frozen sequence exactly: Severity → Risk Score → Escalation
 * → Workers Affected → Permit Conflict → Confidence → Timestamp →
 * Incident ID.
 *
 * "Permit Conflict" (§8.2 attribute #5) has no dedicated boolean field in
 * Appendix A's Incident contract; this treats "has at least one linked
 * Permit" as the conflict signal, which is this layer's interpretation,
 * flagged pending confirmation — same pattern as other spec value-gaps in
 * this codebase.
 */
import type { Incident } from "../../state-layer/src/types/entities";

const SEVERITY_RANK: Record<Incident["severity"], number> = {
  Emergency: 1,
  Critical: 2,
  High: 3,
  Medium: 4,
  Low: 5,
  Informational: 6,
};

const ESCALATION_RANK: Record<Incident["escalationLevel"], number> = {
  PlantManagerEscalated: 5,
  SupervisorEscalated: 4,
  AudibleReminder: 3,
  Reminder: 2,
  None: 1,
  // Acknowledged incidents have left the unacknowledged escalation ladder.
  Acknowledged: 0,
};

function hasPermitConflict(incident: Incident): boolean {
  return incident.permitIds.length > 0;
}

/** Negative if `a` is higher priority than `b`, per §8.2–§8.5. Deterministic — never a tie. */
export function compareIncidentPriority(a: Incident, b: Incident): number {
  // 1. Severity — lower rank number = higher priority (§8.3).
  if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  }
  // 2. Compound Risk Score — higher score wins.
  if (a.riskScore !== b.riskScore) {
    return b.riskScore - a.riskScore;
  }
  // 3. Emergency Escalation Level — higher level wins.
  if (ESCALATION_RANK[a.escalationLevel] !== ESCALATION_RANK[b.escalationLevel]) {
    return ESCALATION_RANK[b.escalationLevel] - ESCALATION_RANK[a.escalationLevel];
  }
  // 4. Workers at Risk — more workers wins.
  if (a.workerIds.length !== b.workerIds.length) {
    return b.workerIds.length - a.workerIds.length;
  }
  // 5. Permit Conflict — present beats absent.
  const aConflict = hasPermitConflict(a);
  const bConflict = hasPermitConflict(b);
  if (aConflict !== bConflict) {
    return aConflict ? -1 : 1;
  }
  // 6. Confidence Score — higher confidence wins.
  if (a.confidenceScore !== b.confidenceScore) {
    return b.confidenceScore - a.confidenceScore;
  }
  // 7. Timestamp — earlier occurrence wins.
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  // 8. Incident ID — lowest ID as the final, always-differentiating tie-breaker.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** §8.7: Resolved/Archived incidents leave the active ranking entirely. */
export function isActiveIncident(incident: Incident): boolean {
  return incident.status === "Active";
}

/** §8.1/§8.6: exactly one Primary Incident among currently active incidents, or none if there are no active incidents. */
export function selectPrimaryIncident(incidents: readonly Incident[]): Incident | undefined {
  const active = incidents.filter(isActiveIncident);
  if (active.length === 0) return undefined;
  return [...active].sort(compareIncidentPriority)[0];
}

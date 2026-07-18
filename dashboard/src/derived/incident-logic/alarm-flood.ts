import type { Incident } from "../../types/entities";
import { compareIncidentPriority, deriveAlarmPriority } from "./prioritization";

/**
 * Represents an Alarm Group per §7.3 Alarm Grouping Rules.
 */
export interface AlarmGroup {
  readonly groupId: string;
  readonly groupBy: "Incident" | "Zone" | "Permit";
  readonly primaryAlarmIncident: Incident;
  readonly supportingIncidents: readonly Incident[];
  readonly alarmCount: number;
  readonly latestUpdate: string;
}

/**
 * §7.3 Alarm Grouping Rules & §7.6 Suppression Rules
 * This implements the flood strategy by grouping incoming active incidents.
 * Critical alarms (P1, P2) are never suppressed or grouped into lower queues, 
 * but they are grouped by their primary incident if multiple exist.
 */
export function groupAlarms(incidents: readonly Incident[]): AlarmGroup[] {
  const groups = new Map<string, AlarmGroup>();

  for (const incident of incidents) {
    // §7.3 Group by Incident (or Permit/Zone based on rules)
    // For simplicity in this logic module, we group primarily by Incident ID since alarms 
    // in this context are mapped 1:1 with Incident entities or are child events. 
    // If there were separate Alarm entities, we'd group them by incident.id.
    // Since we only have Incidents here, we'll demonstrate grouping them by ZoneId 
    // as an example of §7.3 "Group by Zone" when multiple incidents occur in one zone.
    
    let groupId = `INC-${incident.id}`;
    let groupBy: "Incident" | "Zone" | "Permit" = "Incident";

    // For flood strategy demonstration: If there's a permit conflict, group by Permit.
    if (incident.permitIds.length > 0) {
      groupId = `PRM-${incident.permitIds[0]}`;
      groupBy = "Permit";
    } 
    // Otherwise group by Zone if it's a lower priority incident (to prevent flood)
    else if (deriveAlarmPriority(incident.severity) !== "P1" && deriveAlarmPriority(incident.severity) !== "P2") {
      groupId = `ZONE-${incident.zoneId}`;
      groupBy = "Zone";
    }

    const existing = groups.get(groupId);

    if (!existing) {
      groups.set(groupId, {
        groupId,
        groupBy,
        primaryAlarmIncident: incident,
        supportingIncidents: [],
        alarmCount: 1,
        latestUpdate: incident.createdAt, // Or updated_at if available
      });
    } else {
      // Determine which is the primary alarm for this group (§7.3)
      // The primary alarm is the one with highest priority.
      const isNewPrimary = compareIncidentPriority(incident, existing.primaryAlarmIncident) < 0;

      const newPrimary = isNewPrimary ? incident : existing.primaryAlarmIncident;
      const newSupporting = isNewPrimary 
        ? [existing.primaryAlarmIncident, ...existing.supportingIncidents]
        : [...existing.supportingIncidents, incident];

      // Update latest timestamp
      const latest = incident.createdAt > existing.latestUpdate ? incident.createdAt : existing.latestUpdate;

      groups.set(groupId, {
        groupId,
        groupBy,
        primaryAlarmIncident: newPrimary,
        supportingIncidents: newSupporting,
        alarmCount: existing.alarmCount + 1,
        latestUpdate: latest,
      });
    }
  }

  // §7.9 Alarm Queue Rules: Deterministic Sorting
  // We sort the resulting groups by their primary alarm incident priority.
  return Array.from(groups.values()).sort((a, b) => 
    compareIncidentPriority(a.primaryAlarmIncident, b.primaryAlarmIncident)
  );
}

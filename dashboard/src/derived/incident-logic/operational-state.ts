import type { Incident, EscalationLevel } from "../../types/entities";

/** §9.11 Operational State enum */
export type OperationalState = "Normal" | "Elevated" | "Emergency";

/**
 * §9.11 One-way derivation chain result.
 * This represents the single, globally derived dashboard state.
 */
export interface DashboardDerivationChain {
  readonly primaryIncident: Incident | null;
  readonly operationalState: OperationalState;
  
  // Dashboard Layout Priority
  readonly autoFocusEnabled: boolean;
  
  // Emergency Banner
  readonly emergencyBannerVisible: boolean;
  
  // Panel Expansion
  readonly panelsExpanded: boolean;

  // Escalation rendering (directly from backend)
  readonly escalationLevel: EscalationLevel;
}

/**
 * §9.11 Derivation Chain Implementation
 * This function enforces the structural impossibility of disagreement
 * because all UI state is a pure function of the given Primary Incident.
 */
export function deriveDashboardState(primaryIncident: Incident | null): DashboardDerivationChain {
  // 1. Primary Incident -> Operational State
  const operationalState = deriveOperationalState(primaryIncident);
  
  // 2. Operational State -> Dashboard Layout (Panel priority)
  // §8.10 Auto-Focus Rules: Only Emergency (P1) and Critical (P2) trigger Auto-Focus.
  const autoFocusEnabled = operationalState === "Emergency" || operationalState === "Elevated";
  
  // 3. Operational State -> Emergency Banner
  const emergencyBannerVisible = operationalState === "Emergency";
  
  // 4. Emergency Banner -> Panel Expansion (§9.5)
  const panelsExpanded = emergencyBannerVisible;
  
  // Escalation level renderer (§9.10 - never computed locally)
  const escalationLevel = primaryIncident?.escalationLevel ?? "None";

  return {
    primaryIncident,
    operationalState,
    autoFocusEnabled,
    emergencyBannerVisible,
    panelsExpanded,
    escalationLevel,
  };
}

/**
 * Derives operational state strictly from incident severity per §8.10 mapping
 * mapped down to operational state.
 */
function deriveOperationalState(incident: Incident | null): OperationalState {
  if (!incident) return "Normal";
  if (incident.severity === "Emergency") return "Emergency";
  if (incident.severity === "Critical") return "Elevated";
  return "Normal";
}

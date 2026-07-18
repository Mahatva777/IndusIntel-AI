/**
 * DashboardShell — top-level layout owner (architecture §8).
 *
 * Wires the full §9.11 derivation chain at the top level:
 *   Primary Incident → Operational State → Layout → Banner → Panel Expansion
 *
 * Provides derived state via LayoutContext to all descendants.
 * Sets `data-state` on the root element for global CSS scoping.
 *
 * Per §9.11: "The Dashboard has exactly one global operational state at
 * any moment. That state is not independently decided by the UI — it is
 * derived from the Primary Incident."
 */
import { useMemo } from "react";
import { getAllEntities } from "@shared/normalization";
import { useIncidentStoreState } from "@domain/incident/store";
import { selectPrimaryIncident } from "../derived/incident-logic/prioritization";
import { deriveDashboardState } from "../derived/incident-logic/operational-state";
import { LayoutProvider } from "./LayoutContext";
import { EmergencyBanner } from "./EmergencyBanner";
import { OfflineBanner } from "./OfflineBanner";
import { GlobalStatusBar } from "./GlobalStatusBar";
import { NavigationRail } from "./NavigationRail";
import { MainWorkspace } from "./MainWorkspace";
import { useSelectionState } from "../ui-state/selection/store";

export function DashboardShell() {
  // §9.11 Derivation Chain — single global value, recomputed on any
  // change to the Primary Incident (§8.8 Priority Update Rules).
  // change to the Primary Incident (§8.8 Priority Update Rules).
  const { incidents } = useIncidentStoreState();
  const { selectedIncidentId } = useSelectionState();
  
  const layoutState = useMemo(() => {
    const primary = selectPrimaryIncident(getAllEntities(incidents));
    const derived = deriveDashboardState(primary);
    
    // §12.8 / §2.9 Selection Priority:
    // Emergency Auto Focus > Manual Incident > Auto Selection (Primary)
    let focusedIncident = primary;
    if (derived.operationalState !== "Emergency" && selectedIncidentId) {
      // incidents is EntityStoreState<Incident>, use its byId record
      const manual = incidents.byId[selectedIncidentId];
      if (manual) focusedIncident = manual;
    }
    
    return {
      ...derived,
      focusedIncident,
    };
  }, [incidents, selectedIncidentId]);

  return (
    <LayoutProvider value={layoutState}>
      <div
        data-state={layoutState.operationalState.toLowerCase()}
        className={`
          min-h-screen flex flex-col
          bg-[var(--color-surface-base)] text-[var(--color-text-primary)]
          font-industrial
          ${layoutState.operationalState === "Emergency"
            ? "ring-2 ring-inset ring-severity-emergency/30"
            : ""
          }
        `}
      >
        {/* §9.11 step 3: Emergency Banner visible iff Operational State = Emergency */}
        <EmergencyBanner />

        {/* Offline Banner visible iff infrastructureHealthy is false */}
        <OfflineBanner />

        {/* Global status bar — always visible (architecture §8) */}
        <GlobalStatusBar />

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          <NavigationRail />
          <MainWorkspace />
        </div>
      </div>
    </LayoutProvider>
  );
}

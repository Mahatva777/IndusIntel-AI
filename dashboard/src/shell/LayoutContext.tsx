/**
 * LayoutContext — §9.11 Derivation Chain context provider.
 *
 * Distributes the globally-derived operational state to all shell
 * descendants. Populated exclusively from `deriveDashboardState()` in
 * DashboardShell — no local state, no independent client decisions
 * (§9.11 Synchronization Rules).
 */
import React, { createContext, useContext } from "react";
import type { DashboardDerivationChain } from "../derived/incident-logic/operational-state";
import type { Incident } from "../types/entities";

export interface LayoutContextState extends DashboardDerivationChain {
  readonly focusedIncident: Incident | null;
}

/**
 * Default value represents Normal operational state with no active
 * incident. Every field here is the "nothing happening" baseline.
 */
const DEFAULT_LAYOUT: LayoutContextState = {
  primaryIncident: null,
  focusedIncident: null,
  operationalState: "Normal",
  autoFocusEnabled: false,
  emergencyBannerVisible: false,
  panelsExpanded: false,
  escalationLevel: "None",
};

const LayoutCtx = createContext<LayoutContextState>(DEFAULT_LAYOUT);

interface LayoutProviderProps {
  readonly value: LayoutContextState;
  readonly children: React.ReactNode;
}

export function LayoutProvider({ value, children }: LayoutProviderProps) {
  return <LayoutCtx.Provider value={value}>{children}</LayoutCtx.Provider>;
}

/**
 * Read the current layout derivation chain. This is the single entry
 * point for any component that needs to know the dashboard operational
 * state, whether panels are expanded, or what the primary incident is.
 */
export function useLayoutState(): LayoutContextState {
  return useContext(LayoutCtx);
}

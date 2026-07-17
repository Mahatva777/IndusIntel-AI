/**
 * Navigation state slice (§1.3: Flat Object, owner Navigation Controller,
 * on-interaction, "Minimal" memory strategy; §1.5 Lifetime Policy:
 * "Restore" on startup, "Save" on shutdown — UI preference persistence per
 * §1.1 "Persistence | UI preferences only"). Only the functions exported
 * here mutate this slice.
 *
 * Persistence itself (localStorage/session restore wiring) is out of scope
 * for this state-layer-only task; this module only defines the shape and
 * in-memory mutation surface the persistence layer would read from/write to.
 */
import { create } from "zustand";
import { updateFlatObject } from "@shared/normalization";
import type { DashboardRoute, NavigationState } from "./types";

const INITIAL_NAVIGATION_STATE: NavigationState = {
  activeRoute: "overview",
  rightSidebarExpanded: true,
  bottomPanelExpanded: true,
};

const useNavigationInternalStore = create<NavigationState>(() => ({ ...INITIAL_NAVIGATION_STATE }));

export function navigateTo(route: DashboardRoute): void {
  useNavigationInternalStore.setState((state) => updateFlatObject(state, { activeRoute: route }));
}

export function setRightSidebarExpanded(expanded: boolean): void {
  useNavigationInternalStore.setState((state) =>
    updateFlatObject(state, { rightSidebarExpanded: expanded }),
  );
}

export function setBottomPanelExpanded(expanded: boolean): void {
  useNavigationInternalStore.setState((state) =>
    updateFlatObject(state, { bottomPanelExpanded: expanded }),
  );
}

export function useNavigationState(): NavigationState {
  return useNavigationInternalStore((state) => state);
}

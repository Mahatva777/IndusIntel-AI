/**
 * Navigation State — §1.3 names this slice "Active route/layout" with a
 * "Minimal" memory strategy but does not enumerate concrete fields or
 * route names. PLACEHOLDER shape pending confirmation, same pattern as
 * other spec value-gaps flagged in this codebase (see README.md).
 */
export type DashboardRoute = "overview" | "incident-workspace" | "digital-twin" | "historical-playback";

export interface NavigationState {
  readonly activeRoute: DashboardRoute;
  /** UI-only layout toggle, restored on startup per §1.5 Lifetime Policy ("Restore"). */
  readonly rightSidebarExpanded: boolean;
  readonly bottomPanelExpanded: boolean;
}

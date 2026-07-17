import { GlobalStatusBar } from "./GlobalStatusBar";
import { NavigationRail } from "./NavigationRail";
import { MainWorkspace } from "./MainWorkspace";

/**
 * DashboardShell — layout owner (DASHBOARD_ARCHITECTURE.md §8).
 *
 * Per §8 "Component Responsibilities": owns application layout, navigation,
 * and global synchronization. Does NOT own business data.
 *
 * This composes the three top-level nodes from §8's Component Hierarchy
 * diagram to prove the folder/import boundaries wire together. Every child
 * is a `return null` placeholder (see src/shell/README.md) — no panel is
 * mounted, no state is read, no layout CSS beyond this outer frame exists
 * yet. That's later-prompt work.
 */
export function DashboardShell() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <GlobalStatusBar />
      <div className="flex flex-1">
        <NavigationRail />
        <MainWorkspace />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-type-3 font-industrial text-slate-400">
          Dashboard scaffold — shell, domain, streaming, api, and panel
          boundaries are wired; no panels are implemented yet.
        </p>
      </div>
    </div>
  );
}

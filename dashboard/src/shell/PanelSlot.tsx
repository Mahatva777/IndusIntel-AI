/**
 * PanelSlot — §16.6 Panel Priority layout wrapper.
 *
 * Typed wrapper that:
 * - Applies z-index from the §16.6 panel priority scale (P1–P6)
 * - Applies §9.5 expansion behavior when panelsExpanded is true
 * - Applies §9.6 visual persistence (elements keep state until recovery)
 * - Renders children or a labeled placeholder for later panel drop-in
 *
 * Every panel family gets a PanelSlot so later prompts can drop panel
 * components in without touching the shell layout again.
 */
import React from "react";
import { useLayoutState } from "./LayoutContext";
import { Typo } from "../shared/ui/Typography";

export type PanelPriority = 1 | 2 | 3 | 4 | 5 | 6;

/** Panels that expand during emergency per §9.5 */
const EXPANDABLE_PANELS = new Set([
  "incident-focus",
  "recommendations",
  "evidence-chain",
]);

const Z_CLASS: Record<PanelPriority, string> = {
  1: "z-panel-p1",
  2: "z-panel-p2",
  3: "z-panel-p3",
  4: "z-panel-p4",
  5: "z-panel-p5",
  6: "z-panel-p6",
};

interface PanelSlotProps {
  readonly panelId: string;
  readonly priority: PanelPriority;
  readonly children?: React.ReactNode;
  readonly className?: string;
}

export const PanelSlot: React.FC<PanelSlotProps> = React.memo(
  ({ panelId, priority, children, className = "" }) => {
    const { panelsExpanded, operationalState } = useLayoutState();

    const isExpanded = panelsExpanded && EXPANDABLE_PANELS.has(panelId);
    const stateClass = operationalState === "Emergency"
      ? "ring-1 ring-severity-emergency/20"
      : operationalState === "Elevated"
        ? "ring-1 ring-severity-critical/10"
        : "";

    return (
      <section
        id={`panel-${panelId}`}
        data-panel-id={panelId}
        data-priority={priority}
        data-expanded={isExpanded || undefined}
        className={`
          ${Z_CLASS[priority]}
          relative
          bg-[var(--color-surface-raised)]
          border border-[var(--color-border-subtle)]
          rounded-lg
          overflow-hidden
          transition-all duration-[var(--anim-duration-emphasis)]
          ${isExpanded ? "row-span-2 col-span-2" : ""}
          ${stateClass}
          ${className}
        `}
      >
        {children ?? <PanelPlaceholder name={panelId} />}
      </section>
    );
  },
);

PanelSlot.displayName = "PanelSlot";

/** Visual placeholder shown when a panel component hasn't been dropped in yet. */
function PanelPlaceholder({ name }: { readonly name: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center p-4">
      <Typo level={5} className="text-slate-500 uppercase tracking-widest">
        {name.replace(/-/g, " ")}
      </Typo>
    </div>
  );
}

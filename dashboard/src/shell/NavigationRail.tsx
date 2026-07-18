/**
 * NavigationRail — persistent vertical navigation (architecture §8).
 *
 * Vertical icon rail with labeled items for each panel family.
 * Highlights emergency-relevant panels when operationalState !== "Normal".
 * §10.2: keyboard accessible.
 */
import { useLayoutState } from "./LayoutContext";
import { Typo } from "../shared/ui/Typography";

interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  /** Panels that visually highlight during emergency (§9.5) */
  readonly emergencyRelevant?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: "incident-focus",   label: "Incidents",    icon: "⚠", emergencyRelevant: true },
  { id: "digital-twin",     label: "Spatial",      icon: "◎", emergencyRelevant: true },
  { id: "alert-queue",      label: "Alerts",       icon: "⦿", emergencyRelevant: true },
  { id: "recommendations",  label: "Actions",      icon: "✦", emergencyRelevant: true },
  { id: "evidence-chain",   label: "Evidence",     icon: "◇", emergencyRelevant: true },
  { id: "worker-panel",     label: "Workers",      icon: "⊕" },
  { id: "permit-panel",     label: "Permits",      icon: "◈" },
  { id: "timeline",         label: "Timeline",     icon: "━" },
  { id: "cctv",             label: "CCTV",         icon: "◉" },
  { id: "system-health",    label: "Health",       icon: "♡" },
];

export function NavigationRail() {
  const { operationalState } = useLayoutState();
  const isEmergency = operationalState === "Emergency" || operationalState === "Elevated";

  const scrollToPanel = (panelId: string) => {
    document.getElementById(`panel-${panelId}`)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav
      aria-label="Panel Navigation"
      className="
        flex flex-col items-center gap-1
        w-14 py-3
        bg-[var(--color-surface-raised)]
        border-r border-[var(--color-border-subtle)]
        shrink-0 overflow-y-auto
      "
    >
      {NAV_ITEMS.map((item) => {
        const highlighted = isEmergency && item.emergencyRelevant;
        return (
          <button
            key={item.id}
            onClick={() => scrollToPanel(item.id)}
            title={item.label}
            tabIndex={10}
            aria-label={`Navigate to ${item.label} panel`}
            className={`
              flex flex-col items-center justify-center
              w-10 h-10 rounded-lg
              transition-colors duration-[var(--anim-duration-emphasis)]
              focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
              ${highlighted
                ? "text-severity-emergency bg-severity-emergency/10"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }
            `}
          >
            <span className="text-lg" aria-hidden="true">{item.icon}</span>
            <Typo level={6} as="span" className={`leading-none mt-0.5 ${highlighted ? "text-severity-emergency" : ""}`}>
              {item.label.substring(0, 4)}
            </Typo>
          </button>
        );
      })}
    </nav>
  );
}

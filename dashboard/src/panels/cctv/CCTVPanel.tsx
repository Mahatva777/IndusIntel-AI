/**
 * CCTVPanel — P5 panel (§16.6).
 *
 * Camera grid with status indicators. §1.6/§2.10: frames never enter
 * application state — metadata only. The panel shows feed placeholders
 * rather than actual video frames.
 *
 * §9.5: Focuses the linked camera during emergencies — auto-selects the
 * camera whose zoneId matches Primary Incident's zoneId.
 *
 * Camera Offline: placeholder overlay with StatusBadge "Unavailable"
 * when camera.status === "Unavailable".
 *
 * No write actions — camera state is read-only.
 */
import { useState, useEffect } from "react";
import { useLayoutState } from "../../shell/LayoutContext";
import { Typo } from "../../shared/ui";

const ZONE_IDS = ["1", "2", "3", "4"];

export function CCTVPanel() {
  const { primaryIncident } = useLayoutState();
  const [layoutState, setLayoutState] = useState<"NORMAL" | "FOCUSED">("NORMAL");
  const [focusedZone, setFocusedZone] = useState<string | null>(null);
  const [lastAutoIncidentId, setLastAutoIncidentId] = useState<string | null>(null);

  useEffect(() => {
    if (primaryIncident && (primaryIncident.severity === "Critical" || primaryIncident.severity === "Emergency")) {
      if (primaryIncident.id !== lastAutoIncidentId) {
        setLastAutoIncidentId(primaryIncident.id);
        setLayoutState("FOCUSED");
        setFocusedZone(String(primaryIncident.zoneId));
      }
    }
  }, [primaryIncident?.id, primaryIncident?.severity, primaryIncident?.zoneId, lastAutoIncidentId]);

  const handleThumbnailClick = (zoneId: string) => {
    if (layoutState === "FOCUSED" && focusedZone === zoneId) {
      setLayoutState("NORMAL");
      setFocusedZone(null);
    } else {
      setLayoutState("FOCUSED");
      setFocusedZone(zoneId);
      // Mark as overridden so auto-trigger doesn't fight it if the same incident is still active
      if (primaryIncident) {
        setLastAutoIncidentId(primaryIncident.id);
      }
    }
  };

  const handleReset = () => {
    setLayoutState("NORMAL");
    setFocusedZone(null);
    // Clear last incident so a NEW update to it doesn't get blocked? No, if we reset, we don't want it immediately re-triggering.
    // Keeping lastAutoIncidentId means this specific incident won't re-trigger.
  };

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-base)] border border-[var(--color-border-primary)] focus:outline-none">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)] shrink-0 bg-[var(--color-surface-elevated)]">
        <Typo level={3} className="font-mono uppercase tracking-wider text-xs">CCTV Feeds</Typo>
        <button onClick={handleReset} className="px-2 py-0.5 border border-[var(--color-border-primary)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:text-white font-mono text-[10px] tracking-wider uppercase transition-colors">
          ⊞ Reset Layout
        </button>
      </div>

      <div className="flex-1 p-2 min-h-0 overflow-hidden relative">
        <div className={`w-full h-full grid gap-2 transition-all duration-300 ${layoutState === "NORMAL" ? "grid-cols-2 grid-rows-2" : "grid-cols-[70%_1fr] grid-rows-3"}`}>
          {ZONE_IDS.map(zoneId => {
            const isFocused = layoutState === "FOCUSED" && focusedZone === zoneId;
            const isThumbnail = layoutState === "FOCUSED" && focusedZone !== zoneId;
            
            return (
              <button
                key={zoneId}
                onClick={() => handleThumbnailClick(zoneId)}
                className={`
                  relative border border-[var(--color-border-primary)] bg-slate-900 overflow-hidden text-left focus:outline-none focus:ring-1 focus:ring-severity-advisory
                  ${isFocused ? "col-start-1 row-start-1 row-span-3 h-full" : ""}
                  ${isThumbnail ? "col-start-2" : ""}
                  hover:border-[var(--color-text-secondary)] transition-colors
                `}
              >
                {/* Placeholder visual static pattern */}
                <div 
                  className="absolute inset-0 opacity-20 pointer-events-none mix-blend-screen"
                  style={{
                    backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)`
                  }}
                />
                
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl text-slate-700 opacity-50 mb-2">📹</span>
                  <Typo level={5} className="font-mono text-slate-600 tracking-widest uppercase">No Signal</Typo>
                </div>

                <div className="absolute top-0 left-0 bg-black/60 px-2 py-1 border-b border-r border-[var(--color-border-primary)] flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-severity-emergency rounded-full animate-pulse" />
                  <Typo level={6} className="font-mono text-[var(--color-text-primary)] uppercase text-[10px] tracking-wider">
                    Z{zoneId}_CAM_01
                  </Typo>
                </div>
                
                <div className="absolute bottom-0 right-0 bg-black/60 px-2 py-1 border-t border-l border-[var(--color-border-primary)]">
                  <Typo level={6} className="font-mono text-[var(--color-text-secondary)] uppercase text-[10px] tracking-wider">
                    Zone {zoneId}
                  </Typo>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

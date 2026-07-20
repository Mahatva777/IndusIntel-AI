import { useEffect, useMemo, useState, useRef } from "react";
import { Typo } from "../../shared/ui";
import ZoneMap from "./ZoneMap";
import EvacuationOverlay from "./EvacuationOverlay";
import { computeEvacuation } from "./evacuation";
import { useDigitalTwinState } from "./useDigitalTwinState";


/**
 * DigitalTwinPanel
 *
 * Renders the live zone map (with worker chips + permit badges, both
 * already handled inside ZoneMap's own grouping logic) stacked under the
 * evacuation overlay, driven entirely by usePlantSnapshotStream — no
 * polling, no manual refresh, re-renders on every snapshot tick.
 *
 * EVACUATION TRIGGER — chosen approach: auto-trigger + manual override,
 * combined, not either/or.
 *   - Auto: the instant any zone's severity_band reaches CRITICAL,
 *     evacuation mode goes active automatically. Reasoning: in a real
 *     incident you cannot rely on an operator remembering to click a
 *     button — the whole point of this panel is that guidance appears
 *     the moment it's needed. This mirrors the rest of the codebase's own
 *     pattern (DashboardShell derives a single global "Emergency"
 *     operational state from the primary incident, not from a manual
 *     toggle).
 *   - Manual: a button lets an operator ALSO activate evacuation mode
 *     pre-emptively (e.g. HIGH conditions trending badly) or for demo/
 *     drill purposes without needing to fake a CRITICAL reading. Manual
 *     activation can be turned back off by the operator; auto-activation
 *     cannot be dismissed while a zone is still CRITICAL, since silencing
 *     a live CRITICAL warning would be unsafe.
 *
 * WORKER-ZONE SELECTION — since evacuation guidance is per current_zone
 * and many workers may be on shift, this panel exposes a simple zone
 * selector (defaulting to the first known worker's current_zone from the
 * live snapshot) so any zone's guidance can be inspected for the demo.
 * In a single-worker/"my own zone" deployment this selector can be
 * dropped and currentZone hardcoded to that worker's zone_id.
 */
export function DigitalTwinPanel() {
  const snapshot = useDigitalTwinState();
  const { severities, workers, permits, connected } = snapshot;

  const [manualEvacuation, setManualEvacuation] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // padding is 8px on each side, so content is inner width
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Default the zone selector to the first worker seen in the live
  // snapshot, once, the first time workers arrive — but don't fight the
  // operator if they've since picked a different zone themselves.
  useEffect(() => {
    if (selectedZoneId === null && workers.length > 0) {
      setSelectedZoneId(workers[0].current_zone);
    }
  }, [workers, selectedZoneId]);

  const anyZoneCritical = useMemo(
    () => Object.values(severities).some((band) => band === "CRITICAL"),
    [severities]
  );

  const evacuationActive = manualEvacuation || anyZoneCritical;

  const evacuationResult = useMemo(() => {
    if (!selectedZoneId) return null;
    return computeEvacuation(selectedZoneId, severities);
  }, [selectedZoneId, severities]);

  // Distinct worker zone_ids present in the current snapshot, for the selector.
  const knownWorkerZones = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const w of workers) {
      if (!seen.has(w.current_zone)) {
        seen.add(w.current_zone);
        ordered.push(w.current_zone);
      }
    }
    return ordered;
  }, [workers]);

  return (
    <div
      role="region"
      aria-label="Digital Twin"
      className="flex flex-col h-full focus:outline-none border border-[var(--color-border-primary)] bg-[var(--color-surface-base)] relative overflow-hidden"
    >
      <div className="relative z-10 flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)] shrink-0 bg-[var(--color-surface-elevated)]">
        <Typo level={3} className="font-mono uppercase tracking-wider text-xs">
          Digital Twin
        </Typo>
        <span
          className="font-mono text-[10px] uppercase tracking-wider"
          style={{ color: connected ? "#3F9BAA" : "#D4483A" }}
        >
          {connected ? "Live" : "Disconnected"}
        </span>
      </div>

      {/* Evacuation controls */}
      <div className="relative z-10 flex items-center gap-3 px-3 py-2 border-b border-[var(--color-border-primary)] shrink-0 bg-[var(--color-surface-elevated)] font-mono text-xs">
        <label className="flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-[var(--color-text-secondary)]">
          Zone
          <select
            value={selectedZoneId ?? ""}
            onChange={(e) => setSelectedZoneId(e.target.value)}
            className="bg-[var(--color-surface-base)] border border-[var(--color-border-primary)] text-[var(--color-text-primary)] text-xs px-1 py-0.5"
          >
            {knownWorkerZones.length === 0 && <option value="">—</option>}
            {knownWorkerZones.map((zoneId) => (
              <option key={zoneId} value={zoneId}>
                Zone {zoneId}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={() => setManualEvacuation((v) => !v)}
          className="px-2 py-1 border uppercase tracking-wider text-[10px]"
          style={{
            backgroundColor: manualEvacuation ? "#7A1F1F" : "transparent",
            borderColor: manualEvacuation ? "#A62C2C" : "var(--color-border-primary)",
            color: manualEvacuation ? "#FBE3E3" : "var(--color-text-primary)",
          }}
        >
          {manualEvacuation ? "Cancel Evacuation" : "Trigger Evacuation"}
        </button>

        {anyZoneCritical && (
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "#FBE3E3" }}>
            Auto-triggered: CRITICAL zone detected
          </span>
        )}
      </div>

      {/* Zone map + evacuation overlay, stacked with identical containerWidth so
          the overlay's arrows/labels line up exactly with ZoneMap's tiles. */}
      <div className="relative z-10 flex-1 overflow-auto p-2 min-h-0" ref={containerRef}>
        {containerWidth > 0 && (
          <div style={{ position: "relative", display: "inline-block" }}>
            <ZoneMap
              severities={severities}
              workers={workers}
              permits={permits}
              containerWidth={containerWidth}
            />
            {selectedZoneId && evacuationResult && (
              <div style={{ position: "absolute", left: 0, top: 0 }}>
                <EvacuationOverlay
                  evacuationActive={evacuationActive}
                  evacuationResult={evacuationResult}
                  currentZone={selectedZoneId}
                  containerWidth={containerWidth}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

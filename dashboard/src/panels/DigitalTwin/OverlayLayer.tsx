import React, { useMemo } from "react";
import { useDashboardStatus } from "../../../src/derived/selectors";
import { useAllZones } from "../../../src/domain/zone/store";
import { useAllDigitalTwins } from "../../../src/domain/digital-twin/store";
import { Incident } from "../../../src/types/entities";

interface OverlayLayerProps {
  scale?: number;
  primaryIncident: Incident | null;
}

/**
 * Renders both Base Overlays (from DigitalTwin) and Incident Highlights (from Primary Incident).
 * Architecturally separated from equipment/zones.
 */
export const OverlayLayer: React.FC<OverlayLayerProps> = React.memo(({ scale = 1, primaryIncident }) => {
  const twins = useAllDigitalTwins();
  const zones = useAllZones();
  const { operationalState } = useDashboardStatus();

  const twin = twins.length > 0 ? twins[0] : null;

  // 1. Base Overlays (e.g., Heatmaps) driven by Digital Twin static config
  const baseOverlays = useMemo(() => {
    if (!twin || !twin.overlays) return null;
    
    // In a real implementation, we would parse twin.overlays to render SVG rects/heatmaps.
    // Here we just represent the architectural separation.
    const keys = Object.keys(twin.overlays);
    if (keys.length === 0) return null;

    return (
      <g className="base-overlays opacity-30 pointer-events-none">
        {/* Placeholder for base overlays */}
      </g>
    );
  }, [twin]);

  // 2. Incident Highlight Overlays (§9.5: "Digital Twin: Highlight affected zone")
  const incidentHighlights = useMemo(() => {
    // Only highlight if there is an emergency or elevated state exists
    const isEmergency = operationalState === "Emergency" || operationalState === "Elevated";
    if (!isEmergency || !primaryIncident) return null;

    const affectedZone = zones.find((z) => z.id === primaryIncident.zoneId);
    if (!affectedZone || !affectedZone.geometry?.polygon) return null;

    const polygonPoints = affectedZone.geometry.polygon.map((p) => `${p.x},${p.y}`).join(" ");

    return (
      <g className="incident-highlights pointer-events-none animate-pulse">
        <polygon
          points={polygonPoints}
          className="fill-red-500/20 stroke-red-500 stroke-[3px]"
        />
      </g>
    );
  }, [operationalState, primaryIncident, zones]);

  return (
    <g className="overlay-layer" transform={`scale(${scale})`}>
      {baseOverlays}
      {incidentHighlights}
    </g>
  );
});

OverlayLayer.displayName = "OverlayLayer";

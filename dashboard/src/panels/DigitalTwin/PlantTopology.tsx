import React, { useMemo, useState, useEffect } from "react";
import { useAllZones } from "../../../src/domain/zone/store";
import { useWorker } from "../../../src/domain/worker/store";
import { useSelectionState } from "../../../src/ui-state/selection/store";
import { useCrossPanelInteractions } from "../../../src/shared/hooks/useCrossPanelInteractions";
import { Zone } from "../../../src/types/entities";
import type { WorkerId } from "../../../src/types/ids";
import { useFrameTime } from "../../../src/shared/hooks/useFrameTime";

interface PlantTopologyProps {
  onZoneClick?: (zoneId: string) => void;
  scale?: number;
  pan?: { x: number; y: number };
}

// Bounding box helper
function getBoundingBox(polygon: ReadonlyArray<{ readonly x: number; readonly y: number }>) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export const PlantTopology: React.FC<PlantTopologyProps> = React.memo(({ onZoneClick, scale = 1, pan = { x: 0, y: 0 } }) => {
  const baseZones = useAllZones();
  const { selectedZoneId, selectedWorkerId } = useSelectionState();
  const selectedWorker = useWorker(selectedWorkerId as WorkerId);
  const effectiveSelectedZoneId = selectedWorkerId && selectedWorker ? selectedWorker.zoneId : selectedZoneId;
  
  const { onZoneClick: globalZoneClick } = useCrossPanelInteractions();
  
  const { fps, frameTime } = useFrameTime(true);

  // Log frame time every second
  useEffect(() => {
    const interval = setInterval(() => {
      console.log(`[Performance] PlantTopology Frame Time: ${frameTime.toFixed(2)}ms (${fps.toFixed(1)} FPS)`);
    }, 1000);
    return () => clearInterval(interval);
  }, [frameTime, fps]);

  const zones = baseZones;

  const handleZoneClick = (zoneId: string) => {
    globalZoneClick(zoneId);
    if (onZoneClick) {
      onZoneClick(zoneId);
    }
  };

  // Occlusion Culling logic
  // Assume a 1920x1080 viewport for estimation if ResizeObserver is not available
  const viewportW = 1920;
  const viewportH = 1080;
  const viewMinX = -pan.x / scale;
  const viewMinY = -pan.y / scale;
  const viewMaxX = viewMinX + viewportW / scale;
  const viewMaxY = viewMinY + viewportH / scale;

  const visibleZones = useMemo(() => {
    return zones.filter(zone => {
      if (!zone || !zone.geometry || !Array.isArray(zone.geometry.polygon)) return false;
      const bbox = getBoundingBox(zone.geometry.polygon);
      return !(bbox.maxX < viewMinX || bbox.minX > viewMaxX || bbox.maxY < viewMinY || bbox.minY > viewMaxY);
    });
  }, [zones, viewMinX, viewMinY, viewMaxX, viewMaxY]);

  return (
    <>
      <g
        className="plant-topology-layer"
        role="group"
        aria-label="Plant topology map — clickable zone regions"
      >
        {visibleZones.map((zone, index) => (
          <ZoneShape
            key={zone.id}
            zone={zone}
            isSelected={zone.id === effectiveSelectedZoneId}
            onClick={() => handleZoneClick(zone.id)}
            focusIndex={index}
          />
        ))}
      </g>
    </>
  );
});

PlantTopology.displayName = "PlantTopology";

interface ZoneShapeProps {
  zone: Zone;
  isSelected: boolean;
  onClick: () => void;
  focusIndex: number;
}

const ZoneShape: React.FC<ZoneShapeProps> = React.memo(({ zone, isSelected, onClick, focusIndex }) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };
  const polygonPoints = useMemo(() => {
    if (!zone || !zone.geometry || !Array.isArray(zone.geometry.polygon)) return "";
    return zone.geometry.polygon.map((p) => `${p.x},${p.y}`).join(" ");
  }, [zone]);

  if (!polygonPoints) return null;

  return (
    <polygon
      points={polygonPoints}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={6}
      role="button"
      aria-label={`Select zone: ${zone.name || zone.id}${isSelected ? " (currently selected)" : ""}`}
      aria-pressed={isSelected}
      aria-roledescription="Plant zone region"
      data-zone-id={zone.id}
      className={`
        cursor-pointer transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
        ${isSelected ? "fill-blue-500/30 stroke-blue-500 stroke-2" : "fill-slate-800/40 stroke-slate-600 stroke-1"}
        hover:fill-slate-700/50
      `}
    >
      <title>{zone.name || zone.id}</title>
    </polygon>
  );
});

ZoneShape.displayName = "ZoneShape";


import React, { useMemo } from "react";
import { useAllEquipment } from "../../../src/domain/equipment/store";
import { useAllLatestTelemetry } from "../../../src/domain/telemetry/store";
import { useSelectionState } from "../../../src/ui-state/selection/store";
import { useHoverState } from "../../../src/ui-state/hover/store";
import { useCrossPanelInteractions } from "../../../src/shared/hooks/useCrossPanelInteractions";
import { useDashboardStatus } from "../../../src/derived/selectors";
import { Equipment, TelemetryReading } from "../../../src/types/entities";

interface EquipmentLayerProps {
  onEquipmentClick?: (equipmentId: string) => void;
  scale?: number;
}

export const EquipmentLayer: React.FC<EquipmentLayerProps> = React.memo(({ onEquipmentClick, scale = 1 }) => {
  const allEquipment = useAllEquipment();
  const allTelemetry = useAllLatestTelemetry();
  // Ensure we don't crash if selectedEquipmentId isn't typed properly yet.
  const selection = useSelectionState() as any;
  const selectedEquipmentId = selection.selectedEquipmentId;
  const { hoveredEquipmentId } = useHoverState();
  const { onEquipmentHover } = useCrossPanelInteractions();
  const { infrastructureHealthy } = useDashboardStatus();

  // Create a quick lookup map for telemetry by equipment ID at render time to satisfy §3.8
  // This is highly performant and doesn't persist the merged entity back to any store.
  const telemetryMap = useMemo(() => {
    const map = new Map<string, TelemetryReading[]>();
    for (const t of allTelemetry) {
      if (!map.has(t.equipmentId)) {
        map.set(t.equipmentId, []);
      }
      map.get(t.equipmentId)!.push(t);
    }
    return map;
  }, [allTelemetry]);

  const handleEquipmentClick = (equipmentId: string) => {
    // If selectEquipment isn't available, we just call the prop callback
    if (onEquipmentClick) {
      onEquipmentClick(equipmentId);
    }
  };

  return (
    <g className="equipment-layer" transform={`scale(${scale})`}>
      {allEquipment.map((equipment) => (
        <EquipmentMarker
          key={equipment.id}
          equipment={equipment}
          telemetry={telemetryMap.get(equipment.id) || []}
          isSelected={equipment.id === selectedEquipmentId}
          isHovered={equipment.id === hoveredEquipmentId}
          isStale={!infrastructureHealthy}
          onClick={() => handleEquipmentClick(equipment.id)}
          onMouseEnter={() => onEquipmentHover(equipment.id)}
          onMouseLeave={() => onEquipmentHover(null)}
        />
      ))}
    </g>
  );
});

EquipmentLayer.displayName = "EquipmentLayer";

interface EquipmentMarkerProps {
  equipment: Equipment;
  telemetry: TelemetryReading[];
  isSelected: boolean;
  isHovered: boolean;
  isStale: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const EquipmentMarker: React.FC<EquipmentMarkerProps> = React.memo(({ equipment, telemetry, isSelected, isHovered, isStale, onClick, onMouseEnter, onMouseLeave }) => {
  // Extract coordinates from spec, fallback to 0,0 if not provided
  const x = typeof equipment.spec?.x === "number" ? equipment.spec.x : 0;
  const y = typeof equipment.spec?.y === "number" ? equipment.spec.y : 0;

  // Determine operational state purely for rendering
  // Example logic: if any telemetry value > 90, show warning color
  const hasWarning = useMemo(() => telemetry.some((t) => t.value > 90), [telemetry]);

  const fillClass = hasWarning ? "fill-amber-500" : "fill-slate-300";
  const strokeClass = isSelected ? "stroke-blue-400 stroke-2" : isHovered ? "stroke-slate-400 stroke-2" : "stroke-slate-700 stroke-1";
  const opacityClass = isStale ? "opacity-50 grayscale" : "opacity-100";

  return (
    <g transform={`translate(${x}, ${y})`} className={`cursor-pointer ${opacityClass}`} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {/* §10.7 Redundant Severity Encoding: Triangle for warning, Circle for normal */}
      {hasWarning ? (
        <polygon points="0,-9 7.79,4.5 -7.79,4.5" className={`${fillClass} ${strokeClass} hover:brightness-125 transition-all`} />
      ) : (
        <circle r={8} className={`${fillClass} ${strokeClass} hover:brightness-125 transition-all`} />
      )}
      
      {/* Live Value Badge overlay AT RENDER TIME ONLY */}
      {telemetry.length > 0 && (
        <g>
          <rect x={12} y={-10} width={40} height={20} rx={4} className="fill-slate-800 stroke-slate-600 stroke-1" />
          <text x={16} y={4} className={`text-[10px] font-mono ${isStale ? "fill-slate-500" : "fill-slate-200"}`}>
            {telemetry[0].value.toFixed(1)} {isStale ? "(Stale)" : ""}
          </text>
        </g>
      )}
      <title>
        {equipment.name} ({equipment.type})
        {telemetry.length > 0 ? `\nLive: ${telemetry.map(t => t.value.toFixed(2)).join(', ')}` : ""}
      </title>
    </g>
  );
});

EquipmentMarker.displayName = "EquipmentMarker";

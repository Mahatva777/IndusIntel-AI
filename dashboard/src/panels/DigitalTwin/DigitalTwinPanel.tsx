import React, { useState } from "react";
import { PlantTopology } from "./PlantTopology";
import { EquipmentLayer } from "./EquipmentLayer";
import { OverlayLayer } from "./OverlayLayer";
import { useDashboardStatus, selectPrimaryIncident } from "../../../src/derived/selectors";
import { useIncidentStoreState } from "../../../src/domain/incident/store";
import { getAllEntities } from "../../../src/shared/normalization";

export const DigitalTwinPanel: React.FC = React.memo(() => {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  const { operationalState, infrastructureHealthy } = useDashboardStatus();
  
  // Get Primary incident to drive overlays without persisting state
  const incidentState = useIncidentStoreState();
  const primaryIncident = selectPrimaryIncident(getAllEntities(incidentState.incidents)) ?? null;

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      role="region"
      aria-label="Digital Twin Panel — interactive 2D plant map"
      aria-roledescription="Spatial model"
      className={`digital-twin-panel relative w-full h-full overflow-hidden bg-slate-900 border focus:outline-none focus:ring-2 focus:ring-severity-advisory rounded-lg transition-opacity duration-300 ${operationalState === "Emergency" ? "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]" : "border-slate-700"} ${!infrastructureHealthy ? "opacity-60 saturate-50 pointer-events-none" : ""}`}
    >
      
      {/* HUD Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 pointer-events-none">
        <h2 className="text-slate-100 font-bold tracking-wider text-sm uppercase">Spatial Model</h2>
        <div className="flex gap-2 pointer-events-auto">
          <button 
            className="px-2 py-1 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            onClick={() => setScale((s) => Math.min(s + 0.2, 3))}
            tabIndex={6}
            aria-label="Zoom in digital twin"
          >
            Zoom In
          </button>
          <button 
            className="px-2 py-1 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            onClick={() => setScale((s) => Math.max(s - 0.2, 0.5))}
            tabIndex={6}
            aria-label="Zoom out digital twin"
          >
            Zoom Out
          </button>
        </div>
      </div>

      {/* Main SVG Render Surface (16ms budget target) */}
      <svg
        className={`w-full h-full ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label="Interactive SVG rendering of plant layout"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
          </pattern>
        </defs>
        
        <rect width="100%" height="100%" fill="url(#grid)" />

        <g className="viewport-transform" transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
          {/* Layer 1: Base Topology (Static read-only shapes) */}
          <PlantTopology pan={pan} scale={scale} />
          
          {/* Layer 2: Dynamic Overlays (Incidents & Heatmaps) */}
          <OverlayLayer scale={scale} primaryIncident={primaryIncident} />
          
          {/* Layer 3: Equipment & Live Telemetry (Merged at render time) */}
          <EquipmentLayer scale={scale} />
        </g>
      </svg>
    </div>
  );
});

DigitalTwinPanel.displayName = "DigitalTwinPanel";

import React from "react";
import { ZONES } from "./zoneData";
import type { EvacuationResult } from "./evacuation";
import { getPerimeterConnectionPoints } from "./geometry";

export interface EvacuationOverlayProps {
  evacuationActive: boolean;
  evacuationResult: EvacuationResult;
  currentZone: string;
}

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1000;
const ARROW_COLOR = "#E7EAED";
const EXIT_GREEN = "#1F6F4A";
const EXIT_WHITE = "#F4FBF7";
const WARNING_BG = "#7A1F1F";
const WARNING_BORDER = "#A62C2C";
const WARNING_FG = "#FBE3E3";
const LABEL_BG = "#15181B";
const LABEL_BORDER = "#54595F";
const LABEL_FG = "#E7EAED";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

function getZoneRect(zoneId: string): Rect | null {
  const zone = ZONES.find((z) => z.zone_id === zoneId);
  if (!zone) return null;
  const { x, y, width, height } = zone.layout;
  return { left: x, top: y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
}

const ExitArrowIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size * 0.72} viewBox="0 0 50 36" aria-hidden="true">
    <rect x="0" y="0" width="50" height="36" rx="3" fill={EXIT_GREEN} />
    <rect x="6" y="8" width="10" height="20" fill={EXIT_WHITE} />
    <path d="M20 18 H42 M42 18 L34 11 M42 18 L34 25" stroke={EXIT_WHITE} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const RunningFigureIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
    <circle cx="18" cy="18" r="17" fill={EXIT_GREEN} />
    <circle cx="17" cy="9" r="3" fill={EXIT_WHITE} />
    <path
      d="M17 13 L20 20 L26 17 M20 20 L16 24 L19 30 M20 20 L14 22 L10 28 M17 13 L11 17"
      stroke={EXIT_WHITE}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

const WarningIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2 L23 21 H1 Z" fill={WARNING_BG} stroke={WARNING_BORDER} strokeWidth="1.2" strokeLinejoin="round" />
    <rect x="11" y="9" width="2" height="6" fill={WARNING_FG} />
    <rect x="11" y="17" width="2" height="2" fill={WARNING_FG} />
  </svg>
);

const EvacuationOverlay: React.FC<EvacuationOverlayProps> = ({
  evacuationActive,
  evacuationResult,
  currentZone,
}) => {
  if (!evacuationActive) return null;

  if (evacuationResult.type === "official") {
    const rect = getZoneRect(currentZone);
    if (!rect) return null;

    const labelTop = Math.min(rect.top + rect.height + 4, CANVAS_HEIGHT - 30);
    const labelLeft = Math.max(0, Math.min(rect.left, CANVAS_WIDTH - 260));

    return (
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: labelLeft,
            top: labelTop,
            maxWidth: 260,
            display: "flex",
            alignItems: "center",
            gap: 6,
            backgroundColor: LABEL_BG,
            border: `1px solid ${LABEL_BORDER}`,
            color: LABEL_FG,
            fontSize: 10,
            lineHeight: 1.3,
            padding: "5px 8px",
            boxSizing: "border-box",
            fontFamily:
              "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          <ExitArrowIcon />
          <span>{evacuationResult.route}</span>
        </div>
      </div>
    );
  }

  if (evacuationResult.type === "no_safe_route") {
    const rect = getZoneRect(currentZone);
    const labelTop = rect ? Math.min(rect.top + rect.height + 4, CANVAS_HEIGHT - 30) : 4;
    const labelLeft = rect ? Math.max(0, Math.min(rect.left, CANVAS_WIDTH - 260)) : 4;

    return (
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: labelLeft,
            top: labelTop,
            maxWidth: 260,
            display: "flex",
            alignItems: "center",
            gap: 6,
            backgroundColor: WARNING_BG,
            border: `1px solid ${WARNING_BORDER}`,
            color: WARNING_FG,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.02em",
            lineHeight: 1.3,
            padding: "5px 8px",
            boxSizing: "border-box",
            fontFamily:
              "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          <WarningIcon />
          <span>NO SAFE EVACUATION ROUTE — HOLD POSITION, AWAIT INSTRUCTION</span>
        </div>
      </div>
    );
  }

  const path = evacuationResult.path;
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  
  for (let i = 0; i < path.length - 1; i++) {
    const zoneA = ZONES.find(z => z.zone_id === path[i]);
    const zoneB = ZONES.find(z => z.zone_id === path[i + 1]);
    
    if (zoneA && zoneB) {
      // Use perimeter connections to route arrows dynamically
      const { pointA, pointB } = getPerimeterConnectionPoints(zoneA.layout, zoneB.layout);
      segments.push({ x1: pointA.x, y1: pointA.y, x2: pointB.x, y2: pointB.y });
    }
  }

  const finalRect = getZoneRect(path[path.length - 1]);
  if (!finalRect || segments.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        pointerEvents: "none",
      }}
    >
      <svg
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
      >
        <defs>
          <marker
            id={`evac-arrowhead-${currentZone}`}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={ARROW_COLOR} />
          </marker>
        </defs>
        {segments.map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={ARROW_COLOR}
            strokeWidth={4}
            markerEnd={`url(#evac-arrowhead-${currentZone})`}
            strokeDasharray="10, 5" // animated flow line effect
          />
        ))}
      </svg>

      <div
        style={{
          position: "absolute",
          left: finalRect.centerX - 11,
          top: finalRect.centerY - 11,
          zIndex: 50,
        }}
      >
        <RunningFigureIcon />
      </div>
    </div>
  );
};

export default EvacuationOverlay;

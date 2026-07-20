import React from "react";
import { ZONES } from "./zoneData";
import type { EvacuationResult } from "./evacuation";

/**
 * EvacuationOverlay
 *
 * A transparent visual layer meant to be stacked directly on top of
 * ZoneMap (see composition note at the bottom of this file). It never
 * renders its own zone tiles — it only draws evacuation guidance using
 * the SAME coordinate math ZoneMap uses (maxX/maxY derived from ZONES,
 * scale = containerWidth / maxX), so arrows and labels land exactly on
 * top of the real tiles regardless of containerWidth.
 *
 * Behavior by evacuationResult.type:
 *   - evacuationActive === false: renders nothing at all.
 *   - "official": a route label + standard exit-arrow icon near the
 *     worker's own zone tile. No path is drawn across other zones,
 *     because we only have route TEXT for the official route, not a
 *     real path through intermediate zones.
 *   - "rerouted": directional arrows connecting each consecutive pair of
 *     zone_ids in `path`, in order, plus a running-figure/exit icon at
 *     the final (safe) zone.
 *   - "no_safe_route": a static warning banner near the worker's zone.
 *     No arrows are ever drawn in this case.
 */

export interface EvacuationOverlayProps {
  evacuationActive: boolean;
  evacuationResult: EvacuationResult;
  /** The worker's current zone_id — used to anchor "official"/"no_safe_route" guidance. */
  currentZone: string;
  /** Must match the containerWidth passed to ZoneMap for the two layers to align. */
  containerWidth?: number;
}

const CONTAINER_WIDTH_DEFAULT = 700;
// Mirrors ZoneMap's own outer padding exactly, so this overlay's inner
// coordinate box lines up with ZoneMap's inner tile area when the two
// are stacked with position: absolute in a shared relative parent.
const PADDING = 16;

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

function computeScale(containerWidth: number) {
  // Identical formula to ZoneMap: scale derived from the data, never
  // hardcoded pixel positions.
  const maxX = Math.max(...ZONES.map((z) => z.layout.x + z.layout.width));
  const maxY = Math.max(...ZONES.map((z) => z.layout.y + z.layout.height));
  const scale = containerWidth / maxX;
  const containerHeight = Math.ceil(maxY * scale);
  return { scale, containerHeight };
}

function getZoneRect(zoneId: string, scale: number): Rect | null {
  const zone = ZONES.find((z) => z.zone_id === zoneId);
  if (!zone) return null;
  const left = zone.layout.x * scale;
  const top = zone.layout.y * scale;
  const width = zone.layout.width * scale;
  const height = zone.layout.height * scale;
  return { left, top, width, height, centerX: left + width / 2, centerY: top + height / 2 };
}

/** Simplified generic exit-sign pictogram: green tile, white door + arrow. Not a reproduction of any specific real-world sign. */
const ExitArrowIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size * 0.72} viewBox="0 0 50 36" aria-hidden="true">
    <rect x="0" y="0" width="50" height="36" rx="3" fill={EXIT_GREEN} />
    <rect x="6" y="8" width="10" height="20" fill={EXIT_WHITE} />
    <path d="M20 18 H42 M42 18 L34 11 M42 18 L34 25" stroke={EXIT_WHITE} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

/** Simplified running-figure pictogram marking the final safe zone. */
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
  containerWidth = CONTAINER_WIDTH_DEFAULT,
}) => {
  if (!evacuationActive) return null;

  const { scale, containerHeight } = computeScale(containerWidth);

  // --- "official": label near the worker's own zone, no drawn path ----
  if (evacuationResult.type === "official") {
    const rect = getZoneRect(currentZone, scale);
    if (!rect) return null;

    // Anchor just below the tile, clamped so it never renders off-panel.
    const labelTop = Math.min(rect.top + rect.height + 4, containerHeight - 30);
    const labelLeft = Math.max(0, Math.min(rect.left, containerWidth - 260));

    return (
      <div
        style={{
          position: "absolute",
          left: PADDING,
          top: PADDING,
          width: containerWidth,
          height: containerHeight,
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

  // --- "no_safe_route": static warning banner, never any arrows -------
  if (evacuationResult.type === "no_safe_route") {
    const rect = getZoneRect(currentZone, scale);
    const labelTop = rect ? Math.min(rect.top + rect.height + 4, containerHeight - 30) : 4;
    const labelLeft = rect ? Math.max(0, Math.min(rect.left, containerWidth - 260)) : 4;

    return (
      <div
        style={{
          position: "absolute",
          left: PADDING,
          top: PADDING,
          width: containerWidth,
          height: containerHeight,
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

  // --- "rerouted": arrows along path, running-figure icon at the end --
  const path = evacuationResult.path;
  const rects = path.map((id) => ({ id, rect: getZoneRect(id, scale) }));
  const validRects = rects.filter((r) => r.rect !== null) as { id: string; rect: Rect }[];

  if (validRects.length === 0) return null;

  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < validRects.length - 1; i++) {
    const a = validRects[i].rect;
    const b = validRects[i + 1].rect;
    segments.push({ x1: a.centerX, y1: a.centerY, x2: b.centerX, y2: b.centerY });
  }

  const finalRect = validRects[validRects.length - 1].rect;

  return (
    <div
      style={{
        position: "absolute",
        left: PADDING,
        top: PADDING,
        width: containerWidth,
        height: containerHeight,
        pointerEvents: "none",
      }}
    >
      <svg
        width={containerWidth}
        height={containerHeight}
        viewBox={`0 0 ${containerWidth} ${containerHeight}`}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      >
        <defs>
          <marker
            id="evac-arrowhead"
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
            strokeWidth={2.5}
            markerEnd="url(#evac-arrowhead)"
          />
        ))}
      </svg>

      <div
        style={{
          position: "absolute",
          left: finalRect.centerX - 11,
          top: finalRect.centerY - 11,
        }}
      >
        <RunningFigureIcon />
      </div>
    </div>
  );
};

export default EvacuationOverlay;

/**
 * Composition example (not part of the exported API):
 *
 *   <div style={{ position: "relative", display: "inline-block" }}>
 *     <ZoneMap severities={severities} containerWidth={700} />
 *     <div style={{ position: "absolute", left: 0, top: 0 }}>
 *       <EvacuationOverlay
 *         evacuationActive={evacuationActive}
 *         evacuationResult={evacuationResult}
 *         currentZone={worker.current_zone}
 *         containerWidth={700}
 *       />
 *     </div>
 *   </div>
 *
 * Passing the same containerWidth to both components guarantees the
 * overlay's arrows/labels align with ZoneMap's tiles, since both derive
 * position from the identical ZONES-based scale calculation.
 */

import React, { useMemo, useState } from "react";
import { ZONES, ADJACENCY, EDGE_CONFIDENCE } from "./zoneData";

/**
 * ZoneMap
 *
 * Top-down schematic ("digital twin") of plant zones, positioned from the
 * static layout coordinates in ZONES, colored by live severity state,
 * annotated with the workers currently present in each zone, and flagged
 * with an unobtrusive badge when a zone has active permits.
 *
 * Design intent: this is an industrial HMI/SCADA-style panel, not a
 * marketing surface. Flat, discrete color bands only — no gradients, no
 * blur, no drop shadows, no animation — so operators can read severity
 * at a glance without ambiguity about where one band ends and another
 * begins.
 *
 * Worker membership model: current_zone is a discrete zone_id, not a
 * coordinate. There is no real-time position tracking within a zone, so
 * workers are rendered as a grouped set of chips inside their zone's
 * tile — never at an interpolated position, never "between" tiles, and
 * never outside the boundary of the tile that matches their current_zone.
 *
 * Permit indicator model: a zone's permit badge reflects only permits
 * with status "active", filtered internally per zone. The badge is a
 * fixed-size, absolutely-positioned corner accent — it is removed from
 * normal flow, so its presence/absence never changes the tile's base
 * layout or size. The detail list is rendered only on click, as a
 * popover anchored to (but not clipped by) the tile, independent of the
 * severity coloring underneath.
 */

export type SeverityBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface WorkerState {
  worker_id: string;
  name: string;
  role: string;
  current_zone: string; // a zone_id, e.g. "1" — membership only, not a coordinate
  ppe_level: string;
  medical_status: string;
}

export interface PermitState {
  permit_id: string;
  zone_id: string;
  permit_type: string; // e.g. "Hot Work", "Confined Space"
  status: "active" | "pending" | "closed";
  workers_assigned: string[]; // worker_ids
}

export interface ZoneMapProps {
  /** Live severity per zone_id. Missing/undefined entries render as "unknown". */
  severities: Record<string, SeverityBand | undefined>;
  /** Workers to display, grouped by their current_zone before rendering. */
  workers?: WorkerState[];
  /** Permits to evaluate; only status === "active" drives the badge, filtered per zone. */
  permits?: PermitState[];
  /** Target rendered width in px. Height is derived from the data's aspect ratio. */
  containerWidth?: number;
  /** Child elements to be rendered in the pannable space (e.g. evacuation paths) */
  children?: React.ReactNode;
}

const CONTAINER_WIDTH_DEFAULT = 700;

// Flat, discrete severity palette. No interpolation between these values.
const SEVERITY_COLORS: Record<SeverityBand, { bg: string; fg: string; border: string }> = {
  LOW: { bg: "#1F6F4A", fg: "#EAF6EF", border: "#2E8F60" },
  MEDIUM: { bg: "#8A6A12", fg: "#FBF3DD", border: "#B08A1C" },
  HIGH: { bg: "#8A3B12", fg: "#FBEADD", border: "#B0521C" },
  CRITICAL: { bg: "#7A1F1F", fg: "#FBE3E3", border: "#A62C2C" },
};

const UNKNOWN_COLOR = { bg: "#3A3F44", fg: "#C7CCD1", border: "#54595F" };

const PANEL_BG = "#15181B";
const GRID_LINE = "#22262A";
const LABEL_MUTED = "#9AA3AB";

// Flat chip colors. A worker whose medical_status is not "FIT" gets a
// distinct flat border color so it reads immediately — still a single
// solid color, not a gradient or glow.
const CHIP_BG = "#0F1113";
const CHIP_BORDER_NORMAL = "#54595F";
const CHIP_BORDER_ALERT = "#D4483A";
const CHIP_FG = "#E7EAED";

// Permit badge / popover colors — deliberately distinct from the severity
// palette so the badge reads as an independent signal, not a severity cue.
const PERMIT_BADGE_BG = "#2E7D8A";
const PERMIT_BADGE_BORDER = "#3F9BAA";
const PERMIT_BADGE_FG = "#EAF7F9";
const POPOVER_BG = "#1B1F22";
const POPOVER_BORDER = "#3F9BAA";
const POPOVER_FG = "#E7EAED";
const STATUS_ACTIVE_COLOR = "#3F9BAA";

function getColor(band: SeverityBand | undefined) {
  if (!band) return UNKNOWN_COLOR;
  return SEVERITY_COLORS[band];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface WorkerChipsProps {
  workers: WorkerState[];
}

const WorkerChips: React.FC<WorkerChipsProps> = ({ workers }) => {
  if (workers.length === 0) return null;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexWrap: "wrap",
        alignContent: "flex-start",
        gap: 4,
        overflow: "hidden",
        padding: "2px 0",
      }}
    >
      {workers.map((w) => {
        const isAlert = w.medical_status.trim().toUpperCase() !== "FIT";
        return (
          <div
            key={w.worker_id}
            title={`${w.name} — ${w.role}\nZone membership: ${w.current_zone}\nPPE: ${w.ppe_level}\nMedical: ${w.medical_status}`}
            style={{
              width: 22,
              height: 22,
              minWidth: 22,
              flexShrink: 0,
              borderRadius: "50%",
              backgroundColor: isAlert ? "#FF4B4B" : "#3F9BAA", // Bright red if alert, otherwise bright teal
              border: `1.5px solid #FFFFFF`,
              color: CHIP_FG,
              fontSize: 8,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            {initials(w.name)}
          </div>
        );
      })}
    </div>
  );
};

const POPOVER_WIDTH = 200;

interface PermitPopoverProps {
  zoneName: string;
  activePermits: PermitState[];
  left: number;
  top: number;
  onClose: () => void;
}

const PermitPopover: React.FC<PermitPopoverProps> = ({
  zoneName,
  activePermits,
  left,
  top,
  onClose,
}) => {
  return (
    <div
      role="dialog"
      aria-label={`Active permits — ${zoneName}`}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left,
        top,
        width: POPOVER_WIDTH,
        maxHeight: 220,
        overflowY: "auto",
        backgroundColor: POPOVER_BG,
        border: `1px solid ${POPOVER_BORDER}`,
        color: POPOVER_FG,
        padding: 10,
        boxSizing: "border-box",
        zIndex: 20,
        fontSize: 11,
        lineHeight: 1.4,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 10, letterSpacing: "0.04em" }}>
          {zoneName.toUpperCase()} — ACTIVE PERMITS
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "transparent",
            border: "none",
            color: LABEL_MUTED,
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
      {activePermits.length === 0 ? (
        <div style={{ color: LABEL_MUTED }}>No active permits.</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {activePermits.map((p) => (
            <li
              key={p.permit_id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "3px 0",
                borderBottom: `1px solid ${GRID_LINE}`,
              }}
            >
              <span>{p.permit_type}</span>
              <span
                style={{
                  color: STATUS_ACTIVE_COLOR,
                  textTransform: "uppercase",
                  fontSize: 9,
                  letterSpacing: "0.05em",
                  flexShrink: 0,
                }}
              >
                {p.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ZoneMap: React.FC<ZoneMapProps> = ({
  severities,
  workers = [],
  permits = [],
  containerWidth = CONTAINER_WIDTH_DEFAULT,
  children,
}) => {
  // Use fixed logical coordinates for graph
  const CANVAS_WIDTH = 1200;
  const CANVAS_HEIGHT = 1000;

  // Small uniform padding so tiles don't touch the panel edge.
  const PADDING = 16;

  // Which zone's permit popover is currently open (at most one at a time).
  const [openPermitZoneId, setOpenPermitZoneId] = useState<string | null>(null);

  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only pan if clicking on the background, not on a card
    if ((e.target as HTMLElement).getAttribute("data-pan-surface")) {
      setIsPanning(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const workersByZone = useMemo(() => {
    const knownZoneIds = new Set(ZONES.map((z) => z.zone_id));
    const grouped: Record<string, WorkerState[]> = {};
    for (const zone of ZONES) grouped[zone.zone_id] = [];
    for (const w of workers) {
      if (knownZoneIds.has(w.current_zone)) {
        grouped[w.current_zone].push(w);
      }
    }
    return grouped;
  }, [workers]);

  const activePermitsByZone = useMemo(() => {
    const grouped: Record<string, PermitState[]> = {};
    for (const zone of ZONES) grouped[zone.zone_id] = [];
    for (const p of permits) {
      if (p.status === "active" && grouped[p.zone_id]) {
        grouped[p.zone_id].push(p);
      }
    }
    return grouped;
  }, [permits]);

  // Generate Edges
  const edges = useMemo(() => {
    const drawn = new Set<string>();
    const edgeList: React.ReactNode[] = [];

    ZONES.forEach((zone) => {
      const neighbors = ADJACENCY[zone.zone_id] || [];
      neighbors.forEach((neighborId) => {
        const neighbor = ZONES.find((z) => z.zone_id === neighborId);
        if (!neighbor) return;

        // Ensure we only draw each undirected edge once
        const edgeKey = [zone.zone_id, neighbor.zone_id].sort().join("-");
        if (drawn.has(edgeKey)) return;
        drawn.add(edgeKey);

        const confidence = EDGE_CONFIDENCE[`${zone.zone_id}-${neighbor.zone_id}`] 
                        || EDGE_CONFIDENCE[`${neighbor.zone_id}-${zone.zone_id}`] 
                        || "high";
                        
        if (!EDGE_CONFIDENCE[`${zone.zone_id}-${neighbor.zone_id}`] && !EDGE_CONFIDENCE[`${neighbor.zone_id}-${zone.zone_id}`]) {
          console.warn(`Missing EDGE_CONFIDENCE for ${zone.zone_id} and ${neighbor.zone_id}`);
        }

        const isDashed = confidence === "low";
        
        // Calculate dynamic perimeter connection points
        const centerA = { x: zone.layout.x + zone.layout.width / 2, y: zone.layout.y + zone.layout.height / 2 };
        const centerB = { x: neighbor.layout.x + neighbor.layout.width / 2, y: neighbor.layout.y + neighbor.layout.height / 2 };
        
        const dx = centerB.x - centerA.x;
        const dy = centerB.y - centerA.y;
        
        const scaleXA = dx !== 0 ? (zone.layout.width / 2) / Math.abs(dx) : Infinity;
        const scaleYA = dy !== 0 ? (zone.layout.height / 2) / Math.abs(dy) : Infinity;
        const scaleA = Math.min(scaleXA, scaleYA);
        const pointA = { x: centerA.x + dx * scaleA, y: centerA.y + dy * scaleA };
        
        const scaleXB = dx !== 0 ? (neighbor.layout.width / 2) / Math.abs(dx) : Infinity;
        const scaleYB = dy !== 0 ? (neighbor.layout.height / 2) / Math.abs(dy) : Infinity;
        const scaleB = Math.min(scaleXB, scaleYB);
        // neighbor is back towards zone A, so subtract
        const pointB = { x: centerB.x - dx * scaleB, y: centerB.y - dy * scaleB };

        edgeList.push(
          <line
            key={edgeKey}
            x1={pointA.x}
            y1={pointA.y}
            x2={pointB.x}
            y2={pointB.y}
            stroke="#3A3F44"
            strokeWidth={3}
            strokeDasharray={isDashed ? "8, 8" : "none"}
          />
        );
      });
    });

    return edgeList;
  }, []);

  return (
    <div
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        background: PANEL_BG,
        fontFamily:
          "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        overflow: "hidden", // Clipping viewport
        cursor: isPanning ? "grabbing" : "grab",
      }}
      data-pan-surface="true"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        style={{
          position: "relative",
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          transition: isPanning ? "none" : "transform 0.1s ease-out",
        }}
      >
        {/* SVG layer for graph edges */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          {edges}
        </svg>

        {/* Node Cards */}
        {ZONES.map((zone) => {
          const band = severities[zone.zone_id];
          const color = getColor(band);
          const zoneWorkers = workersByZone[zone.zone_id] ?? [];
          const zoneActivePermits = activePermitsByZone[zone.zone_id] ?? [];
          const hasActivePermits = zoneActivePermits.length > 0;

          return (
            <div
              key={zone.zone_id}
              title={`${zone.name} — ${band ?? "UNKNOWN"}`}
              onClick={(e) => {
                e.stopPropagation(); // don't trigger pan
                setOpenPermitZoneId(null);
              }}
              style={{
                position: "absolute",
                left: zone.layout.x,
                top: zone.layout.y,
                width: zone.layout.width,
                height: zone.layout.height,
                boxSizing: "border-box",
                backgroundColor: color.bg,
                border: `1px solid ${color.border}`,
                color: color.fg,
                padding: 8,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                cursor: "default",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  lineHeight: 1.25,
                  flexShrink: 0,
                  paddingRight: hasActivePermits ? 14 : 0,
                }}
              >
                {zone.name}
              </div>
              <div
                style={{
                  fontSize: 10,
                  lineHeight: 1.3,
                  opacity: 0.9,
                  flexShrink: 0,
                }}
              >
                {zone.hazard_classification}
              </div>

              <WorkerChips workers={zoneWorkers} />

              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: LABEL_MUTED,
                  flexShrink: 0,
                }}
              >
                {band ?? "UNKNOWN"}
                {zoneWorkers.length > 0 ? ` · ${zoneWorkers.length} on site` : ""}
              </div>

              {/* Permit badge */}
              {hasActivePermits && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenPermitZoneId((current) =>
                      current === zone.zone_id ? null : zone.zone_id
                    );
                  }}
                  aria-label={`${zoneActivePermits.length} active permit(s) in ${zone.name}`}
                  title={`${zoneActivePermits.length} active permit(s)`}
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    backgroundColor: PERMIT_BADGE_BG,
                    border: `1.5px solid ${PERMIT_BADGE_BORDER}`,
                    color: PERMIT_BADGE_FG,
                    fontSize: 8,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                >
                  P
                </button>
              )}
            </div>
          );
        })}

        {/* Popover lives in the transformed coordinate space! */}
        {ZONES.map((zone) => {
          if (openPermitZoneId !== zone.zone_id) return null;

          const zoneActivePermits = activePermitsByZone[zone.zone_id] ?? [];
          const tileLeft = zone.layout.x;
          const tileTop = zone.layout.y;
          const tileWidth = zone.layout.width;

          const wouldOverflowRight = tileLeft + tileWidth + 8 + POPOVER_WIDTH > CANVAS_WIDTH;
          const popLeft = wouldOverflowRight
            ? Math.max(0, tileLeft - POPOVER_WIDTH - 8)
            : tileLeft + tileWidth + 8;
          const popTop = Math.min(tileTop, Math.max(0, CANVAS_HEIGHT - 220));

          return (
            <PermitPopover
              key={zone.zone_id}
              zoneName={zone.name}
              activePermits={zoneActivePermits}
              left={popLeft}
              top={popTop}
              onClose={() => setOpenPermitZoneId(null)}
            />
          );
        })}
        {children}
      </div>
    </div>
  );
};

export default ZoneMap;

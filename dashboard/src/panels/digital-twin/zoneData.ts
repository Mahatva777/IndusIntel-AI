/**
 * zoneData.ts
 *
 * Static reference data for plant zones.
 *
 * NOTE: This data is static and derived from plant layout drawings and
 * process/hazard reasoning — it is NOT sourced from live sensors, live
 * telemetry, or a real-time system. Treat ADJACENCY and EDGE_CONFIDENCE
 * in particular as a documented, human-derived approximation of zone
 * relationships, not a measured/verified graph.
 */

export interface Zone {
  zone_id: string;
  name: string;
  parent_area: string;
  hazard_classification: string;
  ppe_required: string;
  permit_required: string;
  evacuation_route: string;
  layout: { x: number; y: number; width: number; height: number };
}

export const ZONES: Zone[] = [
  {
    zone_id: "zone-furnace-bay",
    name: "Battery Top Deck",
    parent_area: "Coke Oven Battery",
    hazard_classification: "Toxic Gas / Heat",
    ppe_required: "Helmet, FR overalls, goggles, half-mask respirator",
    permit_required: "Hot Work",
    evacuation_route: "North stairway to muster point A",
    layout: { x: 50, y: 150, width: 300, height: 120 },
  },
  {
    zone_id: "zone-loading-dock",
    name: "Quench Area / Track",
    parent_area: "Coke Handling",
    hazard_classification: "Line-of-fire / Fire / Steam",
    ppe_required: "Helmet, FR overalls, goggles, face shield",
    permit_required: "Hot Work",
    evacuation_route: "South walkway to muster point B",
    layout: { x: 50, y: 300, width: 300, height: 120 },
  },
  {
    zone_id: "zone-compressor-room",
    name: "Basement Gas Valve Gallery",
    parent_area: "Gas Distribution",
    hazard_classification:
      "Toxic Gas / Explosive Atmosphere / Confined Space",
    ppe_required:
      "Helmet, FR overalls, full-face respirator, SCBA for entry",
    permit_required: "Confined Space, Gas Testing, Isolation",
    evacuation_route: "Basement ladder to main corridor then muster point C",
    layout: { x: 50, y: 450, width: 300, height: 120 },
  },
  {
    zone_id: "zone-valve-gallery",
    name: "Tar Extractor & By-Product Area",
    parent_area: "By-Product Recovery",
    hazard_classification: "Toxic Vapour (H2S/NH3) / Flammable",
    ppe_required: "Helmet, FR overalls, half-mask respirator",
    permit_required: "Hot Work, Working at Height",
    evacuation_route: "Main structural walkway to muster point D",
    layout: { x: 50, y: 600, width: 300, height: 120 },
  },
  {
    zone_id: "exit-north",
    name: "North Exit",
    parent_area: "External",
    hazard_classification: "Safe",
    ppe_required: "None",
    permit_required: "None",
    evacuation_route: "Safe Zone",
    layout: { x: 50, y: 10, width: 300, height: 60 },
  },
  {
    zone_id: "exit-south",
    name: "South Exit",
    parent_area: "External",
    hazard_classification: "Safe",
    ppe_required: "None",
    permit_required: "None",
    evacuation_route: "Safe Zone",
    layout: { x: 50, y: 750, width: 300, height: 60 },
  }
];

export const ADJACENCY: Record<string, string[]> = {
  "zone-furnace-bay": ["zone-loading-dock", "zone-compressor-room", "exit-north"],
  "zone-loading-dock": ["zone-furnace-bay", "zone-compressor-room", "zone-valve-gallery", "exit-north", "exit-south"],
  "zone-compressor-room": ["zone-furnace-bay", "zone-loading-dock", "zone-valve-gallery", "exit-south"],
  "zone-valve-gallery": ["zone-loading-dock", "zone-compressor-room", "exit-south"],
  "exit-north": ["zone-furnace-bay", "zone-loading-dock"],
  "exit-south": ["zone-valve-gallery", "zone-compressor-room", "zone-loading-dock"],
};

export const EDGE_CONFIDENCE: Record<string, "high" | "medium" | "low"> = {
  "zone-furnace-bay-zone-loading-dock": "medium",
  "zone-furnace-bay-zone-compressor-room": "high",
  "zone-loading-dock-zone-compressor-room": "low",
  "zone-loading-dock-zone-valve-gallery": "high",
  "zone-compressor-room-zone-valve-gallery": "medium",
  "zone-furnace-bay-exit-north": "high",
  "zone-loading-dock-exit-north": "medium",
  "zone-valve-gallery-exit-south": "high",
  "zone-compressor-room-exit-south": "high",
  "zone-loading-dock-exit-south": "low",
};

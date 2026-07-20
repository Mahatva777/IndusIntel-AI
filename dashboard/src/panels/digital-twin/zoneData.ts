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
    zone_id: "exit-north",
    name: "North Exit",
    parent_area: "External",
    hazard_classification: "Safe",
    ppe_required: "None",
    permit_required: "None",
    evacuation_route: "Safe Zone",
    layout: { x: 450, y: 20, width: 300, height: 60 },
  },
  {
    zone_id: "zone-furnace-bay",
    name: "Top deck (Z1)",
    parent_area: "Coke Oven Battery",
    hazard_classification: "Toxic gas / heat",
    ppe_required: "Helmet, FR overalls, goggles, half-mask respirator",
    permit_required: "Hot Work, Working at Height",
    evacuation_route: "North stairway to muster point A",
    layout: { x: 100, y: 150, width: 320, height: 120 },
  },
  {
    zone_id: "zone-loading-dock",
    name: "Quench / track (Z2)",
    parent_area: "Coke Handling",
    hazard_classification: "Fire / steam",
    ppe_required: "Helmet, FR overalls, goggles, face shield",
    permit_required: "Hot Work",
    evacuation_route: "South walkway to muster point B",
    layout: { x: 600, y: 300, width: 320, height: 120 },
  },
  {
    zone_id: "zone-compressor-room",
    name: "Valve gallery (Z3)",
    parent_area: "Gas Distribution",
    hazard_classification: "Gas / confined space",
    ppe_required: "Helmet, FR overalls, full-face respirator, SCBA for entry",
    permit_required: "Confined Space, Gas Testing, Isolation",
    evacuation_route: "Basement ladder to main corridor then muster point C",
    layout: { x: 200, y: 550, width: 320, height: 120 },
  },
  {
    zone_id: "zone-valve-gallery",
    name: "Tar extractor (Z4)",
    parent_area: "By-Product Recovery",
    hazard_classification: "Toxic vapour",
    ppe_required: "Helmet, FR overalls, half-mask respirator",
    permit_required: "Hot Work, Working at Height",
    evacuation_route: "Main structural walkway to muster point D",
    layout: { x: 700, y: 700, width: 320, height: 120 },
  },
  {
    zone_id: "exit-south",
    name: "South Exit",
    parent_area: "External",
    hazard_classification: "Safe",
    ppe_required: "None",
    permit_required: "None",
    evacuation_route: "Safe Zone",
    layout: { x: 300, y: 900, width: 300, height: 60 },
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

export function getZoneName(zoneId: string): string {
  const z = ZONES.find((z) => z.zone_id === zoneId);
  return z ? z.name : zoneId;
}

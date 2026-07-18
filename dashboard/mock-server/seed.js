/**
 * Static seed data the generators mutate over time. IDs are plain strings
 * here — the real dashboard's branded ID types (§ id.ts) narrow these at
 * the API/streaming boundary via `asId`, not something the wire format
 * itself needs to encode.
 */
export const ZONES = [
  { id: "zone-furnace-bay", name: "Furnace Bay" },
  { id: "zone-loading-dock", name: "Loading Dock" },
  { id: "zone-compressor-room", name: "Compressor Room" },
];

export const EQUIPMENT = [
  { id: "equip-furnace-1", zoneId: "zone-furnace-bay", name: "Furnace 1" },
  { id: "equip-conveyor-2", zoneId: "zone-loading-dock", name: "Conveyor 2" },
  { id: "equip-compressor-3", zoneId: "zone-compressor-room", name: "Compressor 3" },
];

export const SENSORS = [
  { id: "sensor-temp-1", zoneId: "zone-furnace-bay", equipmentId: "equip-furnace-1", kind: "temperature", baseline: 620, unit: "C" },
  { id: "sensor-pressure-1", zoneId: "zone-compressor-room", equipmentId: "equip-compressor-3", kind: "pressure", baseline: 8.2, unit: "bar" },
  { id: "sensor-vibration-1", zoneId: "zone-loading-dock", equipmentId: "equip-conveyor-2", kind: "vibration", baseline: 2.1, unit: "mm/s" },
];

export const WORKERS = [
  { id: "worker-1", name: "A. Rossi", zoneId: "zone-furnace-bay", status: "OnSite" },
  { id: "worker-2", name: "B. Kim", zoneId: "zone-loading-dock", status: "OnSite" },
  { id: "worker-3", name: "C. Adeyemi", zoneId: "zone-compressor-room", status: "OnSite" },
];

export const PERMITS = [
  { id: "permit-1", zoneId: "zone-furnace-bay", workerId: "worker-1", equipmentId: "equip-furnace-1", status: "Active" },
  { id: "permit-2", zoneId: "zone-compressor-room", workerId: "worker-3", equipmentId: "equip-compressor-3", status: "Active" },
];

export const CAMERAS = [
  { id: "camera-1", zoneId: "zone-furnace-bay", name: "Furnace Bay North", status: "Active" },
  { id: "camera-2", zoneId: "zone-loading-dock", name: "Loading Dock East", status: "Active" },
  { id: "camera-3", zoneId: "zone-compressor-room", name: "Compressor Room South", status: "Active" },
  { id: "camera-4", zoneId: "zone-furnace-bay", name: "Furnace Bay West", status: "Active" },
];

export const BACKEND_SERVICES = [
  "TelemetryService",
  "IncidentService",
  "WorkerService",
  "PermitService",
  "CameraService",
  "DigitalTwinService",
];

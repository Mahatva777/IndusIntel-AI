/**
 * CCTVPanel — P5 panel (§16.6).
 *
 * Camera grid with status indicators. §1.6/§2.10: frames never enter
 * application state — metadata only. The panel shows feed placeholders
 * rather than actual video frames.
 *
 * §9.5: Focuses the linked camera during emergencies — auto-selects the
 * camera whose zoneId matches Primary Incident's zoneId.
 *
 * Camera Offline: placeholder overlay with StatusBadge "Unavailable"
 * when camera.status === "Unavailable".
 *
 * No write actions — camera state is read-only.
 */
import { useEffect } from "react";
import { useAllCameras } from "../../domain/camera/store";
import { useLayoutState } from "../../shell/LayoutContext";
import { useCrossPanelInteractions } from "../../shared/hooks/useCrossPanelInteractions";
import { useSelectionState } from "../../ui-state/selection/store";
import { useDashboardStatus } from "../../derived/selectors";
import { Typo, StatusBadge, Badge } from "../../shared/ui";
import type { Camera } from "../../types/entities";

export function CCTVPanel() {
  const cameras = useAllCameras();
  const { primaryIncident, operationalState } = useLayoutState();
  const { onCameraClick } = useCrossPanelInteractions();
  const { selectedCameraId } = useSelectionState();
  const { infrastructureHealthy } = useDashboardStatus();

  const isEmergency = operationalState === "Emergency" || operationalState === "Elevated";
  const affectedZoneId = primaryIncident?.zoneId ?? null;

  // §9.5: Auto-select the linked camera during emergencies
  // "Auto Selection never overrides an active Manual Selection unless an Emergency occurs"
  useEffect(() => {
    if (isEmergency && affectedZoneId) {
      const linkedCamera = cameras.find(
        (c) => c.zoneId === affectedZoneId && c.status === "Active",
      );
      if (linkedCamera && linkedCamera.id !== selectedCameraId) {
        onCameraClick(linkedCamera.id);
      }
    }
  }, [isEmergency, affectedZoneId, cameras, selectedCameraId, onCameraClick]);

  // --- Empty state ---
  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <Typo level={5} className="text-slate-500">No cameras available</Typo>
        <Typo level={6} className="text-slate-600 mt-1">
          Camera feeds will appear when available.
        </Typo>
      </div>
    );
  }

  const selectedCamera = cameras.find((c) => c.id === selectedCameraId);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <Typo level={3}>CCTV</Typo>
        <div className="flex items-center gap-2">
          <Badge type="numeric">{cameras.length}</Badge>
          {isEmergency && selectedCamera && (
            <Badge type="severity">Auto-focused</Badge>
          )}
        </div>
      </div>

      {/* Camera grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {cameras.map((camera) => (
            <CameraCard
              key={camera.id}
              camera={camera}
              isSelected={camera.id === selectedCameraId}
              isEmergencyLinked={isEmergency && camera.zoneId === affectedZoneId}
              isNetworkOffline={!infrastructureHealthy}
              onSelect={() => onCameraClick(camera.id === selectedCameraId ? "" : camera.id)}
            />
          ))}
        </div>
      </div>

      {/* Selected camera detail */}
      {selectedCamera && (
        <div className="px-3 py-2 border-t border-[var(--color-border-subtle)]">
          <div className="flex items-center justify-between">
            <Typo level={5} className="text-slate-200">
              {selectedCamera.id} — Zone {String(selectedCamera.zoneId)}
            </Typo>
            <StatusBadge
              status={!infrastructureHealthy || selectedCamera.status === "Unavailable" ? "Unavailable" : "Active"}
              variant="pill"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CameraCard({
  camera,
  isSelected,
  isEmergencyLinked,
  isNetworkOffline,
  onSelect,
}: {
  camera: Camera;
  isSelected: boolean;
  isEmergencyLinked: boolean;
  isNetworkOffline: boolean;
  onSelect: () => void;
}) {
  const isOffline = isNetworkOffline || camera.status === "Unavailable";

  return (
    <button
      onClick={onSelect}
      className={`
        relative rounded-lg border overflow-hidden
        aspect-video
        transition-all
        ${isSelected
          ? "ring-2 ring-severity-advisory border-severity-advisory/40"
          : isEmergencyLinked
            ? "ring-4 ring-severity-emergency border-severity-emergency shadow-[0_0_15px_rgba(239,68,68,0.5)]"
            : "border-slate-700 hover:border-slate-500"
        }
      `}
    >
      {/* §1.6: Frame placeholder — video frames never enter state */}
      <div className={`
        absolute inset-0 flex items-center justify-center
        ${isOffline ? "bg-slate-900" : "bg-slate-800"}
      `}>
        {isOffline ? (
          /* Camera Offline placeholder */
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl text-slate-600" aria-hidden="true">◉</span>
            <StatusBadge status="Unavailable" variant="dot" />
            <Typo level={6} className="text-slate-600">Camera Offline</Typo>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl text-slate-500" aria-hidden="true">◉</span>
            <Typo level={6} className="text-slate-500">Live Feed</Typo>
          </div>
        )}
      </div>

      {/* Camera ID overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/60">
        <div className="flex items-center justify-between">
          <Typo level={6} className="text-slate-300">{camera.id}</Typo>
          {isEmergencyLinked && (
            <span className="inline-block h-2 w-2 rounded-full bg-severity-emergency animate-attention" />
          )}
        </div>
      </div>
    </button>
  );
}

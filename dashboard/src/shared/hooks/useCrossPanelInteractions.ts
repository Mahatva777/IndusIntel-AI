/**
 * useCrossPanelInteractions — central hook for all §12 Interaction Matrix behaviors.
 *
 * Ensures interactions correctly mutate Selection/Navigation/Timeline/Hover 
 * state while triggering defined side effects (like scrolling).
 */
import { useCallback } from "react";
import {
  selectZone,
  selectWorker,
  selectCamera,
  selectIncident,
  selectRecommendation,
} from "../../ui-state/selection/store";
import { setTimelineCursor } from "../../ui-state/timeline/store";
import { hoverWorker, hoverEquipment } from "../../ui-state/hover/store";
import { asId } from "../normalization/id";

export function useCrossPanelInteractions() {
  const onZoneClick = useCallback((zoneId: string) => {
    selectZone(asId(zoneId));
  }, []);

  const onWorkerClick = useCallback((workerId: string) => {
    selectWorker(asId(workerId));
  }, []);

  const onCameraClick = useCallback((cameraId: string) => {
    selectCamera(asId(cameraId));
  }, []);

  const onIncidentClick = useCallback((incidentId: string) => {
    selectIncident(asId(incidentId));
    // Navigation: Scroll to Incident Workspace
    document.getElementById("panel-incident-focus")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const onTimelineClick = useCallback((eventIndex: number) => {
    setTimelineCursor(eventIndex);
  }, []);

  const onRecommendationClick = useCallback((recId: string) => {
    selectRecommendation(asId(recId));
  }, []);

  const onWorkerHover = useCallback((workerId: string | null) => {
    hoverWorker(workerId ? asId(workerId) : null);
  }, []);

  const onEquipmentHover = useCallback((equipmentId: string | null) => {
    hoverEquipment(equipmentId ? asId(equipmentId) : null);
  }, []);

  return {
    onZoneClick,
    onWorkerClick,
    onCameraClick,
    onIncidentClick,
    onTimelineClick,
    onRecommendationClick,
    onWorkerHover,
    onEquipmentHover,
  };
}

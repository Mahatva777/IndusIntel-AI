/**
 * Selection state slice (§1.3: Flat Object, owner UI Controller,
 * on-interaction, "Single active context" memory strategy). Client-local,
 * never synchronized to other operators or the backend (§12.12 Selection
 * State Scope). Only the functions exported here mutate this slice
 * (§1.1); each selection setter clears none of the others — every entity
 * type in §12.3 owns its own independent single-selection slot.
 */
import { create } from "zustand";
import { updateFlatObject } from "@shared/normalization";
import type { SelectionState } from "./types";
import type { CameraId, IncidentId, RecommendationId, WorkerId, ZoneId } from "../../types/ids";

const INITIAL_SELECTION_STATE: SelectionState = {
  selectedZoneId: null,
  selectedWorkerId: null,
  selectedCameraId: null,
  selectedIncidentId: null,
  selectedRecommendationId: null,
};

const useSelectionInternalStore = create<SelectionState>(() => ({ ...INITIAL_SELECTION_STATE }));

export function selectZone(id: ZoneId | null): void {
  useSelectionInternalStore.setState((state) => updateFlatObject(state, { selectedZoneId: id }));
}

export function selectWorker(id: WorkerId | null): void {
  useSelectionInternalStore.setState((state) => updateFlatObject(state, { selectedWorkerId: id }));
}

export function selectCamera(id: CameraId | null): void {
  useSelectionInternalStore.setState((state) => updateFlatObject(state, { selectedCameraId: id }));
}

/** Selecting an incident is the entry point for §8.6 Primary Incident-driven panels reacting to operator focus. */
export function selectIncident(id: IncidentId | null): void {
  useSelectionInternalStore.setState((state) => updateFlatObject(state, { selectedIncidentId: id }));
}

export function selectRecommendation(id: RecommendationId | null): void {
  useSelectionInternalStore.setState((state) =>
    updateFlatObject(state, { selectedRecommendationId: id }),
  );
}

export function clearSelection(): void {
  useSelectionInternalStore.setState({ ...INITIAL_SELECTION_STATE });
}

export function useSelectionState(): SelectionState {
  return useSelectionInternalStore((state) => state);
}

/**
 * Hover state slice (§12.3: "Local UI State" for hovers).
 * 
 * Represents transient, non-persistent selections that span across 
 * panels (e.g. Worker Panel ↔ Digital Twin).
 * 
 * Defined as a global Zustand store rather than React Context to avoid 
 * unnecessary re-renders of the entire component tree, while still allowing
 * cross-panel communication that adheres to the §12 rules.
 */
import { create } from "zustand";
import { updateFlatObject } from "@shared/normalization";
import type { WorkerId, EquipmentId } from "../../types/ids";

export interface HoverState {
  readonly hoveredWorkerId: WorkerId | null;
  readonly hoveredEquipmentId: EquipmentId | null;
}

const INITIAL_HOVER_STATE: HoverState = {
  hoveredWorkerId: null,
  hoveredEquipmentId: null,
};

const useHoverInternalStore = create<HoverState>(() => ({ ...INITIAL_HOVER_STATE }));

export function hoverWorker(id: WorkerId | null): void {
  useHoverInternalStore.setState((state) => updateFlatObject(state, { hoveredWorkerId: id }));
}

export function hoverEquipment(id: EquipmentId | null): void {
  useHoverInternalStore.setState((state) => updateFlatObject(state, { hoveredEquipmentId: id }));
}

export function clearHover(): void {
  useHoverInternalStore.setState({ ...INITIAL_HOVER_STATE });
}

export function useHoverState(): HoverState {
  return useHoverInternalStore((state) => state);
}

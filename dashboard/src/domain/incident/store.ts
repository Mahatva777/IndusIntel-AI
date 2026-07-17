/**
 * Incident state slice (§1.3: Entity Store, owner Incident Service,
 * event-driven, "Active + archived summary" memory strategy).
 *
 * FLAGGED (documented in README.md alongside the two scaffold-stage flags):
 * Recommendation and Evidence are given their own Entity Ownership row in
 * §2.4 and their own Service Contract row in §3.2, but §1.2's Application
 * State Overview / §1.3's State Slice table — the two places this task's
 * store list is drawn from — do not list them as top-level slices. Both
 * relate exclusively to Incident (§2.3: Incident → Evidence;
 * Recommendation → Incident), so they're modeled here as sibling Entity
 * Stores co-located with Incident rather than invented as two more
 * top-level stores the spec never named. `Visible Recommendations` (§2.9)
 * needs a Recommendation store to depend on; this is where it lives.
 *
 * Only the functions exported from this module mutate any of the three
 * stores below (§1.1, §2.4).
 */
import { create } from "zustand";
import {
  createEntityStoreState,
  getAllEntities,
  getEntity,
  removeEntity,
  upsertEntity,
  type EntityStoreState,
} from "@shared/normalization";
import type { Evidence, EvidenceId, Incident, IncidentId, Recommendation, RecommendationId } from "./types";

interface IncidentInternalState {
  readonly incidents: EntityStoreState<Incident>;
  readonly recommendations: EntityStoreState<Recommendation>;
  readonly evidence: EntityStoreState<Evidence>;
}

const useIncidentInternalStore = create<IncidentInternalState>(() => ({
  incidents: createEntityStoreState<Incident>(),
  recommendations: createEntityStoreState<Recommendation>(),
  evidence: createEntityStoreState<Evidence>(),
}));

// --- Mutations (state layer only — no §6 write-path actions here) -------

export function upsertIncident(incident: Incident): void {
  useIncidentInternalStore.setState((state) => ({
    incidents: upsertEntity(state.incidents, incident.id, incident),
  }));
}

/** §8.9 rule 5 — resolved incidents leave the active ranking. */
export function removeIncident(id: IncidentId): void {
  useIncidentInternalStore.setState((state) => ({
    incidents: removeEntity(state.incidents, id),
  }));
}

export function upsertRecommendation(recommendation: Recommendation): void {
  useIncidentInternalStore.setState((state) => ({
    recommendations: upsertEntity(state.recommendations, recommendation.id, recommendation),
  }));
}

/** Evidence is append-only once recorded (Appendix A) — no update/remove path. */
export function addEvidence(evidence: Evidence): void {
  useIncidentInternalStore.setState((state) => ({
    evidence: upsertEntity(state.evidence, evidence.id, evidence),
  }));
}

export function resetIncidentStore(): void {
  useIncidentInternalStore.setState({
    incidents: createEntityStoreState<Incident>(),
    recommendations: createEntityStoreState<Recommendation>(),
    evidence: createEntityStoreState<Evidence>(),
  });
}

// --- Reads ----------------------------------------------------------------

export function useIncident(id: IncidentId): Incident | undefined {
  return useIncidentInternalStore((state) => getEntity(state.incidents, id));
}

export function useAllIncidents(): Incident[] {
  return useIncidentInternalStore((state) => getAllEntities(state.incidents));
}

export function useRecommendation(id: RecommendationId): Recommendation | undefined {
  return useIncidentInternalStore((state) => getEntity(state.recommendations, id));
}

export function useAllRecommendations(): Recommendation[] {
  return useIncidentInternalStore((state) => getAllEntities(state.recommendations));
}

export function useEvidence(id: EvidenceId): Evidence | undefined {
  return useIncidentInternalStore((state) => getEntity(state.evidence, id));
}

export function useAllEvidence(): Evidence[] {
  return useIncidentInternalStore((state) => getAllEntities(state.evidence));
}

/** Raw normalized state, for use by the derived selectors module only (§2.9). */
export function useIncidentStoreState(): IncidentInternalState {
  return useIncidentInternalStore((state) => state);
}

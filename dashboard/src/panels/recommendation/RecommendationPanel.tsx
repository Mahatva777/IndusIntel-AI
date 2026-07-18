/**
 * RecommendationPanel — P2 panel (§16.6).
 *
 * Reflects recommendations for the Primary Incident via
 * useVisibleRecommendations() filtered to primaryIncident.id.
 *
 * §9.5: Expands during emergencies (handled by PanelSlot).
 * §9.6: Persistent — panel remains visible as long as emergency state holds.
 *
 * Write Action: Acknowledge Recommendation — no confirmation per §6.4,
 * wired through write-path, Operator+ permission.
 */
import { useLayoutState } from "../../shell/LayoutContext";
import { useVisibleRecommendations } from "../../derived/selectors";
import { useOperatorActions } from "../../shared/hooks/useOperatorActions";
import { useCrossPanelInteractions } from "../../shared/hooks/useCrossPanelInteractions";
import { useSelectionState } from "../../ui-state/selection/store";
import { Typo, Badge, StatusBadge } from "../../shared/ui";
import type { Recommendation } from "../../types/entities";

export function RecommendationPanel() {
  const { focusedIncident } = useLayoutState();
  const allRecommendations = useVisibleRecommendations();
  const { state: actionState, acknowledgeAlert } = useOperatorActions();
  const { onRecommendationClick } = useCrossPanelInteractions();
  const { selectedRecommendationId } = useSelectionState();

  // Filter to recommendations for the focused incident
  const recommendations = focusedIncident
    ? allRecommendations.filter((r) => r.incidentId === focusedIncident.id)
    : [];

  // --- Empty state ---
  if (!focusedIncident) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Typo level={5} className="text-slate-500">
          No active incident — recommendations will appear here.
        </Typo>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <Typo level={5} className="text-slate-500">No recommendations</Typo>
        <Typo level={6} className="text-slate-600 mt-1">
          AI-generated recommendations for {focusedIncident.id} will appear here.
        </Typo>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Recommendation Panel — AI-generated action recommendations"
      aria-roledescription="Action recommendations"
      className="flex flex-col h-full focus:outline-none focus:ring-2 focus:ring-severity-advisory rounded-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <Typo level={3}>Recommendations</Typo>
        <Badge type="numeric">{recommendations.length}</Badge>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2" role="list" aria-label="Active recommendations">
        {recommendations.map((rec) => (
          <RecommendationCard
            key={rec.id}
            recommendation={rec}
            isSelected={selectedRecommendationId === rec.id}
            onClick={() => onRecommendationClick(rec.id)}
            loading={actionState.loading}
            onAcknowledge={() => {
              // Acknowledge wired through write-path — no confirmation per §6.4
              acknowledgeAlert(focusedIncident.id, () => {});
            }}
          />
        ))}
      </div>
    </div>
  );
}

function RecommendationCard({
  recommendation,
  isSelected,
  onClick,
  loading,
  onAcknowledge,
}: {
  recommendation: Recommendation;
  isSelected: boolean;
  onClick: () => void;
  loading: boolean;
  onAcknowledge: () => void;
}) {
  return (
    <button
      onClick={onClick}
      tabIndex={4}
      role="listitem"
      aria-label={`Recommendation: ${recommendation.content}${recommendation.acknowledged ? " (Acknowledged)" : ""}`}
      className={`
        w-full text-left rounded-lg border px-4 py-3 transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
        ${recommendation.acknowledged
          ? isSelected
            ? "bg-slate-700/50 border-slate-500"
            : "bg-slate-800/30 border-slate-700 hover:bg-slate-800/50"
          : isSelected
            ? "bg-severity-advisory/20 border-severity-advisory/60"
            : "bg-severity-advisory/5 border-severity-advisory/20 hover:bg-severity-advisory/10"
        }
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <Typo level={4} className={recommendation.acknowledged ? "text-slate-400" : "text-slate-100"}>
            {recommendation.content}
          </Typo>
          <Typo level={6} className="text-slate-500 mt-1">
            {new Date(recommendation.createdAt).toLocaleTimeString()}
          </Typo>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {recommendation.acknowledged ? (
            <StatusBadge status="Acknowledged" variant="pill" />
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAcknowledge();
              }}
              disabled={loading}
              tabIndex={4}
              aria-label="Acknowledge recommendation"
              className="
                px-3 py-1.5 rounded-lg
                text-type-6 font-semibold font-industrial
                bg-status-acknowledged/20 text-status-acknowledged
                hover:bg-status-acknowledged/30
                transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
                focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
              "
            >
              Acknowledge
            </button>
          )}
        </div>
      </div>
    </button>
  );
}

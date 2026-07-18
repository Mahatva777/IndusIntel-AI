import { useDashboardStatus } from "../derived/selectors";
import { Typo } from "../shared/ui/Typography";

export function OfflineBanner() {
  const { infrastructureHealthy } = useDashboardStatus();

  if (infrastructureHealthy) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="
        flex items-center justify-center
        px-4 py-2
        bg-slate-700 text-slate-100 border-b border-slate-600
        z-50
      "
    >
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden="true">⚠️</span>
        <Typo level={4} className="font-semibold tracking-wider uppercase">
          Network connection lost. Offline mode active.
        </Typo>
      </div>
    </div>
  );
}

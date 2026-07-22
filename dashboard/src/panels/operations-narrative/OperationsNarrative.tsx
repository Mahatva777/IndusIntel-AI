import { useAgentEmergencyReport, useAgentComplianceFindings } from "../../domain/agent/store";
import { Typo } from "../../shared/ui";

export function OperationsNarrative() {
  const report = useAgentEmergencyReport();
  const compliance = useAgentComplianceFindings();

  return (
    <div className="p-4 overflow-y-auto h-full space-y-4">
      <Typo level={4} className="font-bold text-slate-200">Agent Operations Narrative</Typo>
      
      <div className="border border-slate-700 bg-slate-900/50 p-3 rounded">
        <Typo level={5} className="font-semibold text-slate-300">Emergency Response Orchestrator</Typo>
        {report ? (
          <div className="mt-2">
            {report.disclaimer && (
              <p className="text-xs italic text-slate-400 mb-3">{report.disclaimer}</p>
            )}
            <Typo level={6} className="text-red-400">CRITICAL: {report.summary}</Typo>
            <div className="text-sm mt-2 text-slate-300">
              Affected Zones: {report.affected_zones.join(", ")}
            </div>
            {report.alerts.map((a: any, i: number) => (
              <div key={i} className="mt-3 text-sm text-slate-400 ml-2 border-l-2 border-slate-700 pl-3">
                <strong className="text-slate-200">{a.title}</strong>
                <p className="mt-1">{a.explanation}</p>
                <p className="text-amber-500 mt-1">Action: {a.recommended_action}</p>
                {a.projection_string && (
                  <div className="mt-2 text-cyan-400 text-sm font-semibold bg-cyan-900/20 p-2 rounded border border-cyan-800/50 flex items-center gap-2">
                    <span>⏱️</span>
                    <span>{a.projection_string}</span>
                  </div>
                )}
                {a.precedent && a.precedent.length > 0 && (
                  <div className="mt-2 text-slate-500 text-xs">
                    <em className="text-slate-400 font-semibold mb-1 block">RAG Precedent:</em>
                    {a.precedent.map((p: string, j: number) => (
                      <p key={j} className="mb-1">• {p}</p>
                    ))}
                  </div>
                )}
                {a.evacuation_guidance && (
                  <div className="mt-2 text-slate-500 text-xs">
                    <em className="text-slate-400 font-semibold mb-1 block">Evacuation Protocol:</em>
                    <p>• {a.evacuation_guidance}</p>
                  </div>
                )}
                {a.preserved_evidence && a.preserved_evidence.length > 0 && (
                  <div className="mt-2 text-slate-500 text-xs">
                    <em className="text-slate-400 font-semibold mb-1 block">Preserved Evidence:</em>
                    {a.preserved_evidence.map((e: any, j: number) => (
                      <p key={j} className="mb-1">• [{e.source}] {e.finding} (Severity: {e.severity_contribution})</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {report.notifications_dispatched && report.notifications_dispatched.length > 0 && (
              <div className="mt-4 text-xs text-slate-400 border-t border-slate-700 pt-2">
                <em className="text-slate-300 font-semibold mb-1 block">Dispatched Notifications (Multi-Channel):</em>
                {report.notifications_dispatched.join(", ")}
              </div>
            )}
          </div>
        ) : (
          <div className="text-slate-500 text-sm mt-2">No critical emergencies actively orchestrated.</div>
        )}
      </div>

      <div className="border border-slate-700 bg-slate-900/50 p-3 rounded">
        <Typo level={5} className="font-semibold text-slate-300">Compliance Audit Agent</Typo>
        {compliance.length > 0 ? (
          <div className="mt-2 space-y-3">
            {compliance.map(c => 
              c.findings.map((f, i) => (
                <div key={`${c.id}-${i}`} className="ml-2 border-l-2 border-slate-700 pl-3">
                  <Typo level={6} className="text-amber-400">Zone {c.zoneId}: {f.finding}</Typo>
                  <p className="mt-1 text-sm text-slate-300">
                    <strong className="text-slate-200">Recommended Action:</strong> {f.corrective_action}
                  </p>
                  {f.regulation_reference && f.regulation_reference.length > 0 && (
                    <div className="mt-2 text-slate-500 text-xs">
                      <em className="text-slate-400 font-semibold mb-1 block">RAG Precedent:</em>
                      {f.regulation_reference.map((p: string, j: number) => (
                        <p key={j} className="mb-1">• {p}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="text-slate-500 text-sm mt-2">All monitored active permits fully compliant.</div>
        )}
      </div>
    </div>
  );
}

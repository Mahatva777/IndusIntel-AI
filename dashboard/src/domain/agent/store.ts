import { create } from "zustand";

export interface EmergencyReport {
  disclaimer?: string;
  timestamp: number;
  summary: string;
  affected_zones: string[];
  alerts: any[];
  notifications_dispatched?: any[];
}

export interface ComplianceFinding {
  id: string;
  zoneId: string;
  timestamp: string;
  findings: { finding: string, corrective_action: string, regulation_reference: string[] }[];
}

interface AgentState {
  latestEmergencyReport: EmergencyReport | null;
  complianceFindings: Record<string, ComplianceFinding>;
}

const useAgentStore = create<AgentState>(() => ({
  latestEmergencyReport: null,
  complianceFindings: {},
}));

export function setEmergencyReport(report: EmergencyReport) {
  useAgentStore.setState({ latestEmergencyReport: report });
}

export function addComplianceFinding(finding: ComplianceFinding) {
  useAgentStore.setState((state) => ({
    complianceFindings: {
      ...state.complianceFindings,
      [finding.id]: finding
    }
  }));
}

export function useAgentEmergencyReport() {
  return useAgentStore((state) => state.latestEmergencyReport);
}

export function useAgentComplianceFindings() {
  return useAgentStore((state) => Object.values(state.complianceFindings));
}

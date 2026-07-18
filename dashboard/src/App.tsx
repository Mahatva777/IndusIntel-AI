import { useEffect } from "react";
import { DashboardShell } from "@shell/DashboardShell";
import { StreamingClient } from "./streaming/client";
import { MockTransport } from "./streaming/mockTransport";
import { ServiceName } from "./streaming/types";

export default function App() {
  useEffect(() => {
    // Basic service resolver for the mock server messages
    // The mock server includes `serviceName` in the raw envelope for easy routing
    const resolveService = (raw: Record<string, unknown>): ServiceName | null => {
      return (raw.service as ServiceName) || null;
    };

    const transport = new MockTransport();

    const client = new StreamingClient({
      connectionTransport: transport,
      resyncTransport: transport,
      resolveService,
    });

    client.connect().catch(err => console.error("Streaming client connect error:", err));

    return () => {
      client.close();
    };
  }, []);

  return <DashboardShell />;
}

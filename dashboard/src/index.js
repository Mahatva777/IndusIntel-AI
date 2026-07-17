import { scaled, WS_PORT, DEBUG_PORT, TIME_SCALE } from "./config.js";
import { startWsServer } from "./wsServer.js";
import { startDebugServer } from "./debugServer.js";
import { seedInitialState, startBackgroundGenerators } from "./generators.js";
import { triggerIncidentLifecycleDemo, triggerPrimaryIncidentChangeDemo } from "./incidentScenarios.js";

console.log("Dashboard mock streaming server");
console.log(`  WS:    ws://localhost:${WS_PORT}`);
console.log(`  Debug: http://localhost:${DEBUG_PORT}/debug/status`);
console.log(`  TIME_SCALE=${TIME_SCALE} (1 = real spec timing, e.g. 0.1 = 10x faster demo)`);

seedInitialState();

const { forceDisconnectAll, connectedCount } = startWsServer();
startDebugServer({ forceDisconnectAll, connectedCount });
startBackgroundGenerators();

// Run the two required demo scenarios once, automatically, shortly after
// boot — so `npm start` alone is enough to see a full incident lifecycle
// and a Primary Incident change without touching the debug API. Both can
// also be re-triggered on demand via POST /debug/incident-lifecycle and
// POST /debug/primary-incident-change (see README.md).
setTimeout(() => {
  const incidentId = triggerIncidentLifecycleDemo();
  console.log(`[demo] started incident lifecycle scenario: ${incidentId}`);
}, scaled(5_000));

setTimeout(() => {
  const firstIncidentId = triggerPrimaryIncidentChangeDemo();
  console.log(`[demo] started primary-incident-change scenario: ${firstIncidentId}`);
}, scaled(20_000));

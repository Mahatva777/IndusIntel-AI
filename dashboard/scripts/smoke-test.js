import WebSocket from "ws";

const WS_URL = "ws://localhost:8080";
const DEBUG_URL = "http://localhost:8081";

function post(path, body) {
  return fetch(`${DEBUG_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((r) => r.json());
}

async function main() {
  const ws = new WebSocket(WS_URL);
  const received = { events: [], snapshots: [], ranges: [] };
  let requestSeq = 0;

  await new Promise((resolve) => ws.on("open", resolve));
  console.log("connected");

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "event") received.events.push(msg);
    if (msg.type === "snapshot") received.snapshots.push(msg);
    if (msg.type === "range_response") received.ranges.push(msg);
  });

  ws.send(JSON.stringify({ type: "auth", token: "dev-token" }));
  await new Promise((r) => setTimeout(r, 200));

  ws.send(JSON.stringify({ type: "snapshot_request", requestId: ++requestSeq, service: "Incident" }));
  await new Promise((r) => setTimeout(r, 200));
  console.log("snapshot watermark:", received.snapshots.at(-1)?.watermark, "entities:", received.snapshots.at(-1)?.entities.length);

  console.log("waiting for a few live telemetry events...");
  await new Promise((r) => setTimeout(r, 1500));
  console.log("live events so far:", received.events.length, "services seen:", [...new Set(received.events.map((e) => e.service))]);

  console.log("\n--- debug: drop-sequence on Worker ---");
  const beforeDrop = received.events.filter((e) => e.service === "Worker").length;
  await post("/debug/drop-sequence", { service: "Worker", count: 1 });
  await new Promise((r) => setTimeout(r, 1500));
  const workerSeqs = received.events.filter((e) => e.service === "Worker").map((e) => e.sequenceId);
  console.log("worker sequence IDs received:", workerSeqs, "(expect a gap)");

  console.log("\n--- debug: duplicate on Camera (forcing one to fire) ---");
  await post("/debug/duplicate", { service: "Camera", count: 1 });

  console.log("\n--- debug: incident-lifecycle ---");
  const lifecycle = await post("/debug/incident-lifecycle");
  console.log(lifecycle);

  console.log("\n--- debug: primary-incident-change ---");
  const primaryChange = await post("/debug/primary-incident-change");
  console.log(primaryChange);

  await new Promise((r) => setTimeout(r, 500));
  const incidentEvents = received.events.filter((e) => e.service === "Incident");
  console.log("incident-related events so far:", incidentEvents.map((e) => `${e.entityType}/${e.operation}(${e.payload.id ?? e.payload.incidentId})`));

  console.log("\n--- debug: range_request for the dropped Worker gap ---");
  const workerLog = received.events.filter((e) => e.service === "Worker");
  const seqs = workerLog.map((e) => e.sequenceId).sort((a, b) => a - b);
  const gapStart = seqs.find((s, i) => seqs[i + 1] && seqs[i + 1] - s > 1);
  if (gapStart !== undefined) {
    const gapEnd = seqs[seqs.indexOf(gapStart) + 1] - 1;
    ws.send(JSON.stringify({ type: "range_request", requestId: ++requestSeq, service: "Worker", fromSequenceId: gapStart + 1, toSequenceId: gapEnd }));
    await new Promise((r) => setTimeout(r, 300));
    console.log("range_response:", received.ranges.at(-1));
  } else {
    console.log("no gap detected in worker sequence yet — try again with more wait time");
  }

  console.log("\n--- debug: status ---");
  const status = await fetch(`${DEBUG_URL}/debug/status`).then((r) => r.json());
  console.log(JSON.stringify(status, null, 2));

  console.log("\n--- debug: disconnect ---");
  ws.on("close", (code, reason) => console.log("socket closed:", code, reason.toString()));
  await post("/debug/disconnect");
  await new Promise((r) => setTimeout(r, 300));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

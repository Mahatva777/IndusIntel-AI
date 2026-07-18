import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:8080');
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'auth', token: 'mock-token' }));
});
let count = 0;
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'auth_ack') {
    console.log('Authenticated. Requesting snapshot for Telemetry...');
    ws.send(JSON.stringify({ type: 'snapshot_request', requestId: '1', service: 'Telemetry' }));
  } else if (msg.type === 'snapshot') {
    console.log('Snapshot received. Entities count:', msg.entities.length);
    if (msg.entities.length > 0) {
      console.log('First entity:', msg.entities[0]);
    }
  } else if (msg.type === 'event') {
    if (count < 5) {
      console.log('Event received:', msg.service, msg.entityType);
      count++;
    }
  }
});

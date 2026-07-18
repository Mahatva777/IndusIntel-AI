import WebSocket from 'ws';
import { randomUUID } from 'crypto';

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'auth', token: 'test' }));
});

let isAuth = false;

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'auth_ack') {
    isAuth = true;
    console.log('Authed. Sending start-csv-demo to 8081...');
    fetch('http://localhost:8081/debug/start-csv-demo', { method: 'POST' }).catch(console.error);
  } else if (msg.type === 'event') {
    // Simulate what the frontend does
    if (msg.service === 'Incident') {
      const payload = msg.payload;
      try {
        console.log('Incident payload keys:', Object.keys(payload));
        if (payload.workerIds === undefined) throw new Error('workerIds missing');
        if (payload.workerIds.length === undefined) throw new Error('workerIds.length missing');
      } catch (err) {
        console.error('Incident crash:', err);
      }
    } else if (msg.service === 'Telemetry') {
      const payload = msg.payload;
      try {
        if (payload.value === undefined) throw new Error('value missing');
        if (payload.value === null) throw new Error('value is null');
        payload.value.toFixed(2);
        payload.sensorId.localeCompare("test");
      } catch (err) {
        console.error('Telemetry crash:', err);
        process.exit(1);
      }
    } else if (msg.service === 'CV') {
       // ...
    }
  }
});

// Test-only stand-in for Expo's push service (https://exp.host/--/api/v2/push/send).
// Appends every message it receives to a JSON-lines file the tests read.
// A token containing "DEAD" answers DeviceNotRegistered, like an uninstalled app.
import http from 'node:http';
import fs from 'node:fs';

export function startPushStub({ port, logFile }) {
  fs.writeFileSync(logFile, '');
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const messages = JSON.parse(Buffer.concat(chunks).toString() || '[]');
      for (const m of messages) fs.appendFileSync(logFile, JSON.stringify(m) + '\n');
      const data = messages.map((m) =>
        m.to.includes('DEAD')
          ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
          : { status: 'ok', id: Math.random().toString(36).slice(2) },
      );
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data }));
    });
  });
  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${port}/push`, close: () => new Promise((r) => server.close(r)) }),
    ),
  );
}

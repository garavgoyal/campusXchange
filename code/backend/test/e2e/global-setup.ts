import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { signJwt, startGateway } from '../stack/gateway.mjs';
import { startPushStub } from '../stack/push-stub.mjs';
import { config, PUSH_LOG, STORE_DIR } from './config.js';

/**
 * Runs once before all end-to-end tests:
 *  1. checks the test database and PostgREST are up (see test/README.md),
 *  2. wipes the test data,
 *  3. starts the Supabase stand-in (gateway) and the fake Expo push service,
 *  4. starts the real backend (dist/main.js) twice: one with rate limits
 *     scaled up for speed, one with the real limits.
 */
export default async function setup() {
  fs.rmSync(config.workDir, { recursive: true, force: true });
  fs.mkdirSync(config.workDir, { recursive: true });

  const db = new pg.Client({ connectionString: config.databaseUrl });
  try {
    await db.connect();
  } catch (e) {
    throw new Error(
      `Can't reach the test database at ${config.databaseUrl} (${(e as Error).message}).\n` +
        'Create it with test/stack/setup-db.sh — see test/README.md.',
    );
  }
  await db.query('truncate auth.users cascade');
  await db.end();

  const rest = await fetch(config.postgrestUrl).catch(() => null);
  if (!rest) {
    throw new Error(`PostgREST is not running at ${config.postgrestUrl} — see test/README.md.`);
  }

  const gateway = await startGateway({
    port: config.gatewayPort,
    secret: config.jwtSecret,
    postgrestUrl: config.postgrestUrl,
    storeDir: STORE_DIR,
  });
  const push = await startPushStub({ port: config.pushPort, logFile: PUSH_LOG });

  const main = path.resolve(import.meta.dirname, '../../dist/main.js');
  if (!fs.existsSync(main)) throw new Error('dist/main.js is missing — run `npm run build` first.');

  const start = (port: number, rateLimitScale: string): ChildProcess => {
    const log = fs.openSync(path.join(config.workDir, `backend-${port}.log`), 'w');
    return spawn(process.execPath, [main], {
      env: {
        ...process.env,
        PORT: String(port),
        SUPABASE_URL: gateway.url,
        SUPABASE_SERVICE_ROLE_KEY: signJwt(config.jwtSecret, { role: 'service_role' }),
        EXPO_PUSH_URL: push.url,
        RATE_LIMIT_SCALE: rateLimitScale,
        PUSH_DISABLED: '',
      },
      stdio: ['ignore', log, log],
    });
  };
  const backends = [start(config.apiPort, '1000'), start(config.strictApiPort, '1')];

  for (const port of [config.apiPort, config.strictApiPort]) {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const ok = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok).catch(() => false);
      if (ok) break;
      if (Date.now() > deadline) {
        const log = fs.readFileSync(path.join(config.workDir, `backend-${port}.log`), 'utf8');
        throw new Error(`Backend on port ${port} did not start:\n${log.slice(-2000)}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return async () => {
    for (const b of backends) b.kill();
    await gateway.close();
    await push.close();
  };
}

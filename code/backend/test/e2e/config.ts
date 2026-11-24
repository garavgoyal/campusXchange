import os from 'node:os';
import path from 'node:path';

/**
 * Where the end-to-end tests find their test stack. The defaults match CI
 * (.github/workflows/ci.yml); override any of them with environment variables.
 */
export const config = {
  /** Fresh database made by test/stack/setup-db.sh. */
  databaseUrl: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/cx_test',
  /** PostgREST pointed at that database, started with PGRST_JWT_SECRET = jwtSecret. */
  postgrestUrl: process.env.POSTGREST_URL ?? 'http://127.0.0.1:3001',
  /** Signs the tests' sessions and the service key. Test-only value. */
  jwtSecret: process.env.TEST_JWT_SECRET ?? 'campusxchange-test-only-secret-0123456789abcdef',
  gatewayPort: Number(process.env.E2E_GATEWAY_PORT ?? 54329),
  pushPort: Number(process.env.E2E_PUSH_PORT ?? 4546),
  /** The backend under test, with rate limits scaled up so tests run fast. */
  apiPort: Number(process.env.E2E_API_PORT ?? 3100),
  /** A second copy of the backend with the real rate limits, for the rate-limit tests. */
  strictApiPort: Number(process.env.E2E_STRICT_API_PORT ?? 3101),
  workDir: process.env.E2E_WORK_DIR ?? path.join(os.tmpdir(), 'cx-e2e'),
};

export const API = `http://127.0.0.1:${config.apiPort}`;
export const STRICT_API = `http://127.0.0.1:${config.strictApiPort}`;
export const GATEWAY = `http://127.0.0.1:${config.gatewayPort}`;
export const PUSH_LOG = path.join(config.workDir, 'push-received.jsonl');
export const STORE_DIR = path.join(config.workDir, 'storage');

// Test-only stand-in for a hosted Supabase project's HTTP API, so the backend
// runs unchanged against a plain Postgres:
//   /rest/v1/*      -> PostgREST (the real database, real RLS policies)
//   /auth/v1/user   -> checks the tests' locally signed JWTs
//   /storage/v1/*   -> files in a temp folder (upload, public read, signed URLs)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const b64u = (b) => Buffer.from(b).toString('base64url');

export function signJwt(secret, payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 24 * 3600, ...payload }));
  const s = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

function verifyJwt(secret, token) {
  const [h, p, s] = (token || '').split('.');
  if (!s) return null;
  const want = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  if (want.length !== s.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(s))) return null;
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (d) => chunks.push(d));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

/** Starts the gateway. Resolves to { url, close() }. */
export function startGateway({ port, secret, postgrestUrl, storeDir }) {
  fs.mkdirSync(storeDir, { recursive: true });
  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://gateway');

      if (url.pathname.startsWith('/rest/v1')) {
        const body = await readBody(req);
        const headers = { ...req.headers };
        delete headers.host;
        delete headers['content-length'];
        const upstream = await fetch(postgrestUrl + url.pathname.slice('/rest/v1'.length) + url.search, {
          method: req.method,
          headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
        });
        const out = Buffer.from(await upstream.arrayBuffer());
        const h = {};
        upstream.headers.forEach((v, k) => {
          if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k)) h[k] = v;
        });
        res.writeHead(upstream.status, h);
        return res.end(out);
      }

      if (url.pathname === '/auth/v1/user') {
        const claims = verifyJwt(secret, (req.headers.authorization || '').replace(/^Bearer /, ''));
        if (!claims?.sub) return json(res, 401, { message: 'invalid JWT' });
        return json(res, 200, {
          id: claims.sub, email: claims.email, aud: 'authenticated', role: 'authenticated',
          user_metadata: {}, app_metadata: {},
        });
      }

      const m = url.pathname.match(/^\/storage\/v1\/object\/(sign\/|public\/)?([^/]+)\/(.+)$/);
      if (m) {
        const [, kind, bucket, key] = m;
        const file = path.join(storeDir, bucket, decodeURIComponent(key));
        if (!file.startsWith(path.join(storeDir, bucket) + path.sep)) return json(res, 400, { message: 'bad key' });
        if (kind === 'sign/' && req.method === 'POST') {
          const { expiresIn } = JSON.parse((await readBody(req)).toString() || '{}');
          return json(res, 200, { signedURL: `/object/sign/${bucket}/${key}?token=test&expires_in=${expiresIn}` });
        }
        if (req.method === 'GET') {
          // Only public reads and signed reads, like Supabase.
          if (kind !== 'public/' && !url.searchParams.get('token')) return json(res, 400, { message: 'not public' });
          if (!fs.existsSync(file)) return json(res, 404, { message: 'not found' });
          res.writeHead(200, { 'content-type': 'application/octet-stream' });
          return res.end(fs.readFileSync(file));
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, await readBody(req));
          fs.writeFileSync(file + '.type', String(req.headers['content-type'] ?? ''));
          return json(res, 200, { Key: `${bucket}/${key}`, Id: crypto.randomUUID() });
        }
      }

      json(res, 404, { message: `gateway: no route for ${req.method} ${url.pathname}` });
    } catch (e) {
      json(res, 502, { message: `gateway error: ${e.message}` });
    }
  });

  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) }),
    ),
  );
}

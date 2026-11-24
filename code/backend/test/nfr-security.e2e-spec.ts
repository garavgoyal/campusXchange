import { signJwt } from './stack/gateway.mjs';
import { config, GATEWAY, STRICT_API } from './e2e/config.js';
import {
  agreedDeal, api, fileForm, JPEG, liveListing, makeUser, ok, paidSellDeal, PNG, sql, sqlValue, uploadPhoto, type TestUser,
} from './e2e/helpers.js';

const ZERO = '00000000-0000-0000-0000-000000000000';

/** SRS §5.2 Security, §5.3 Privacy, plus the upload and rate-limit hardening. */
describe('NFR-SEC / NFR-PRV · Security and privacy', () => {
  let admin: TestUser;
  let seller: TestUser;
  let buyer: TestUser;
  let outsider: TestUser;

  beforeAll(async () => {
    admin = await makeUser('Admin', { admin: true });
    seller = await makeUser('Seller');
    buyer = await makeUser('Buyer');
    outsider = await makeUser('Outsider');
  });

  describe('NFR-SEC-1 · every non-public endpoint needs a valid session', () => {
    const protectedRoutes: [string, string][] = [
      ['GET', '/profile/me'], ['PATCH', '/profile'], ['POST', '/profile/id-card'],
      ['GET', '/listings/mine'], ['POST', '/listings'], ['POST', '/listings/images'],
      ['PATCH', `/listings/${ZERO}`], ['DELETE', `/listings/${ZERO}`],
      ['GET', '/chats'], ['POST', '/chats'], ['GET', `/chats/${ZERO}/messages`], ['POST', `/chats/${ZERO}/offers`],
      ['POST', `/chats/offers/${ZERO}/accept`],
      ['GET', '/transactions'], ['GET', `/transactions/${ZERO}`], ['POST', '/transactions'],
      ['POST', `/transactions/${ZERO}/pay`], ['POST', `/transactions/${ZERO}/scan`], ['POST', `/transactions/${ZERO}/dispute`],
      ['GET', '/notifications'], ['POST', '/notifications/push-token'], ['PUT', '/notifications/subscriptions'],
    ];
    const expired = () =>
      signJwt(config.jwtSecret, { role: 'authenticated', sub: buyer.id, email: buyer.email, exp: Math.floor(Date.now() / 1000) - 60 });

    it.each(protectedRoutes)('NFR-SEC-1 · %s %s → 401 with no token, a forged token or an expired one', async (method, path) => {
      const body = method === 'GET' ? undefined : {};
      expect((await api(null, method, path, body)).status).toBe(401);
      const forged = signJwt('not-the-real-secret-at-all-0123456789', { role: 'authenticated', sub: buyer.id, email: buyer.email });
      expect((await api(null, method, path, body, { token: forged })).status).toBe(401);
      expect((await api(null, method, path, body, { token: expired() })).status).toBe(401);
    });

    it('NFR-SEC-1 · public endpoints stay open: health, feed, listing detail, campus places', async () => {
      for (const path of ['/health', '/listings?type=sell', '/campus/locations']) {
        expect((await api(null, 'GET', path)).status, path).toBe(200);
      }
    });
  });

  describe('NFR-SEC-2 · ownership and participation are checked on the server', () => {
    it('NFR-SEC-2 · a student cannot read, pay, cancel or scan someone else’s deal', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin);
      for (const [method, path, body] of [
        ['GET', `/transactions/${deal.id}`, undefined],
        ['POST', `/transactions/${deal.id}/cancel`, undefined],
        ['POST', `/transactions/${deal.id}/scan`, { token: 'AAAAAAAA' }],
        ['POST', `/transactions/${deal.id}/photos`, undefined],
      ] as const) {
        const r = await api(outsider, method, path, body, path.endsWith('photos') ? { form: fileForm({}, { stage: 'handoff' }) } : {});
        expect([403, 404], `${method} ${path}`).toContain(r.status);
      }
      expect(await sqlValue(`select status from transactions where id = $1`, [deal.id])).toBe('escrow_held');
    });

    it('NFR-SEC-2 · finalising someone else’s chat is refused', async () => {
      const l = await liveListing(seller, admin, { type: 'sell', title: 'Sec-2 chat', price: 100 });
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      expect((await api(outsider, 'POST', '/transactions', { chat_id: chat.id })).status).toBe(403);
    });
  });

  describe('NFR-SEC-3 · secrets', () => {
    it('NFR-SEC-3 · no API response contains the service key', async () => {
      const key = signJwt(config.jwtSecret, { role: 'service_role' }).split('.')[0];
      const r = await api(buyer, 'GET', '/profile/me');
      expect(JSON.stringify(r.body)).not.toContain(key + '.');
    });
  });

  describe('NFR-SEC-5 · Row-Level Security: the public app key cannot touch tables directly', () => {
    const anonKey = () => signJwt(config.jwtSecret, { role: 'anon' });
    const rest = (path: string, token: string, init: RequestInit = {}) =>
      fetch(`${GATEWAY}/rest/v1${path}`, {
        ...init,
        headers: { apikey: anonKey(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers },
      });
    const rows = async (res: Response) => (res.ok ? ((await res.json()) as unknown[]) : []);

    it.each(['users', 'listings', 'moderation_queue', 'chats', 'messages', 'offers', 'transactions', 'escrow_holds',
      'qr_tokens', 'lend_details', 'condition_photos', 'disputes', 'notifications', 'category_subscriptions', 'push_tokens'])(
      'NFR-SEC-5 · anon key reads nothing from %s',
      async (table) => {
        expect(await rows(await rest(`/${table}?select=*`, anonKey()))).toEqual([]);
      },
    );

    it('NFR-SEC-5 · every table in the public schema has RLS switched on', async () => {
      const off = await sql(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                              where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
      expect(off).toEqual([]);
    });

    it('NFR-SEC-5 · a signed-in student cannot read other profiles (emails, roll numbers, ID paths)', async () => {
      expect(await rows(await rest('/users?select=email,roll_number,id_card_image_url', buyer.token))).toEqual([]);
    });

    it('NFR-SEC-5 · a student cannot make themselves admin through the REST API', async () => {
      await rest(`/users?id=eq.${buyer.id}`, buyer.token, { method: 'PATCH', body: JSON.stringify({ role: 'admin', id_verified: 'verified' }) });
      expect(await sqlValue(`select role from users where id = $1`, [buyer.id])).toBe('student');
    });

    it('NFR-SEC-5 · a student cannot insert a live listing directly (skipping moderation)', async () => {
      const res = await rest('/listings', buyer.token, {
        method: 'POST',
        body: JSON.stringify({ owner_id: buyer.id, type: 'sell', title: 'Direct insert', category: 'Books', price: 1, status: 'live' }),
      });
      expect(res.ok).toBe(false);
      expect(await sqlValue(`select count(*)::int from listings where title = 'Direct insert'`)).toBe(0);
    });

    it('NFR-SEC-5 · the realtime policies let a participant read their own chat, and nobody else', async () => {
      const l = await liveListing(seller, admin, { type: 'sell', title: 'Sec-5 realtime', price: 100 });
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      await ok(api(buyer, 'POST', `/chats/${chat.id}/messages`, { content: 'Private message' }));
      expect(await rows(await rest(`/messages?chat_id=eq.${chat.id}&select=content`, buyer.token))).toEqual([{ content: 'Private message' }]);
      expect(await rows(await rest(`/messages?chat_id=eq.${chat.id}&select=content`, outsider.token))).toEqual([]);
    });

    it('NFR-SEC-5 · notifications: each student reads only their own', async () => {
      const mine = await rows(await rest('/notifications?select=user_id', seller.token));
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((n: any) => n.user_id === seller.id)).toBe(true);
    });

    it('NFR-SEC-5 · privileged database functions cannot be called with the app key', async () => {
      const res = await rest('/rpc/add_penalty', buyer.token, { method: 'POST', body: JSON.stringify({ p_user: seller.id, p_amount: 500 }) });
      expect(res.ok).toBe(false);
    });
  });

  describe('NFR-SEC-6 · input validation at the API boundary', () => {
    it('NFR-SEC-6 · unknown fields are dropped (no setting owner, status or role)', async () => {
      const l = await ok(api(buyer, 'POST', '/listings', {
        type: 'sell', title: 'Sneaky fields', category: 'Books', price: 5, meeting_location: 'Library',
        owner_id: seller.id, status: 'live', role: 'admin',
      }));
      expect(l.owner_id).toBe(buyer.id);
      expect(l.status).toBe('pending_review');
    });

    it('NFR-SEC-6 · malformed ids are refused before reaching the database', async () => {
      expect((await api(buyer, 'GET', '/transactions/not-a-uuid')).status).toBe(400);
    });

    it.each([
      ['an SVG with a script', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml', 'x.svg'],
      ['an HTML page labelled as PNG', Buffer.from('<html><script>alert(1)</script></html>'), 'image/png', 'x.png'],
      ['a script with a .jpg name', Buffer.from('console.log("hi")'), 'image/jpeg', 'x.jpg'],
      ['a GIF', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;'), 'image/gif', 'x.gif'],
    ])('NFR-SEC-6 · upload of %s is refused', async (_label, bytes, type, name) => {
      const r = await api(seller, 'POST', '/listings/images', undefined, { form: fileForm({ bytes, type, name }) });
      expect(r.status).toBe(400);
    });

    it('NFR-SEC-6 · the stored file type comes from the bytes, not the client', async () => {
      const r = await ok(api(seller, 'POST', '/listings/images', undefined, {
        form: fileForm({ bytes: PNG, type: 'text/html', name: 'page.html' }),
      }));
      expect(r.url).toMatch(/\.png$/);
    });

    it('NFR-SEC-6 · an oversized upload is cut off with 413 before it is read into memory', async () => {
      const big = Buffer.concat([JPEG, Buffer.alloc(20 * 1024 * 1024)]);
      const r = await api(seller, 'POST', '/listings/images', undefined, { form: fileForm({ bytes: big, type: 'image/jpeg', name: 'big.jpg' }) });
      expect(r.status).toBe(413);
    });

    it.each([
      ['an outside link', 'https://tracker.example.com/pixel.gif'],
      ['a javascript: link', 'javascript:alert(1)'],
      ['a path trick', 'OWN/../other/photo.png'],
    ])('NFR-SEC-6 · listing photos must be the student’s own uploads: %s is refused', async (_label, url) => {
      const own = await uploadPhoto(seller);
      const value = url.startsWith('OWN') ? own.replace(/[^/]+$/, '') + url.slice(4) : url;
      const r = await api(seller, 'POST', '/listings', { type: 'sell', title: 'Bad photo link', category: 'Books', price: 5, meeting_location: 'Library', images: [value] });
      expect(r.status).toBe(400);
    });

    it('NFR-SEC-6 · another student’s photo cannot be attached', async () => {
      const theirs = await uploadPhoto(buyer);
      const r = await api(seller, 'POST', '/listings', { type: 'sell', title: 'Stolen photo', category: 'Books', price: 5, meeting_location: 'Library', images: [theirs] });
      expect(r.status).toBe(400);
    });
  });

  describe('NFR-SEC-7 · QR tokens', () => {
    it('NFR-SEC-7 · codes are random and unique per issue', async () => {
      const codes = new Set<string>();
      for (let i = 0; i < 3; i++) {
        const { deal } = await paidSellDeal(seller, buyer, admin);
        await ok(api(seller, 'POST', `/transactions/${deal.id}/photos`, undefined, { form: fileForm({}, { stage: 'handoff' }) }));
        codes.add((await ok(api(seller, 'POST', `/transactions/${deal.id}/qr`))).code);
      }
      expect(codes.size).toBe(3);
    });
  });

  describe('NFR-SEC-10 · security headers and CORS', () => {
    it('responses carry security headers and do not advertise Express', async () => {
      const r = await api(null, 'GET', '/health');
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('x-powered-by')).toBeNull();
      expect(r.headers.get('strict-transport-security')).toBeTruthy();
    });
  });

  describe('NFR-SEC-9 · rate limits (backend with real limits)', () => {
    it('the 21st listing in an hour from one account is refused with 429', async () => {
      const spammer = await makeUser('Spammer');
      const statuses: number[] = [];
      for (let i = 0; i < 21; i++) {
        const r = await api(spammer, 'POST', '/listings', { type: 'sell', title: `Spam ${i}`, category: 'Books', price: 1, meeting_location: 'Library' }, { base: STRICT_API });
        statuses.push(r.status);
      }
      expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
      expect(statuses[20]).toBe(429);
    });

    it('one student hitting the limit does not block another on the same network', async () => {
      const other = await makeUser('Neighbour');
      const r = await api(other, 'POST', '/listings', { type: 'sell', title: 'Not spam', category: 'Books', price: 1, meeting_location: 'Library' }, { base: STRICT_API });
      expect(r.status).toBe(201);
    });

    it('chat messages: more than 30 a minute in one chat is refused', async () => {
      const l = await liveListing(seller, admin, { type: 'sell', title: 'Rate chat', price: 10 });
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      const statuses: number[] = [];
      for (let i = 0; i < 31; i++) {
        statuses.push((await api(buyer, 'POST', `/chats/${chat.id}/messages`, { content: `msg ${i}` }, { base: STRICT_API })).status);
      }
      expect(statuses.filter((s) => s === 201)).toHaveLength(30);
      expect(statuses[30]).toBe(429);
    });
  });

  describe('NFR-PRV · privacy', () => {
    it('NFR-PRV-3 · other students never see your email or roll number', async () => {
      const roll = await sqlValue<string>(`select roll_number from users where id = $1`, [seller.id]);
      const l = await liveListing(seller, admin, { type: 'sell', title: 'Prv-3 lamp', price: 100 });
      const { chat, deal } = await agreedDeal(seller, buyer, l.id, 100);
      const seen = JSON.stringify([
        (await api(buyer, 'GET', `/listings/${l.id}`)).body,
        (await api(buyer, 'GET', '/listings?type=sell')).body,
        (await api(buyer, 'GET', '/chats')).body,
        (await api(buyer, 'GET', `/chats/${chat.id}/offers`)).body,
        (await api(buyer, 'GET', `/transactions/${deal.id}`)).body,
        (await api(buyer, 'GET', '/transactions')).body,
      ]);
      expect(seen).not.toContain(seller.email);
      expect(seen).not.toContain(roll);
    });

    it('NFR-PRV-4 · condition photos are private: signed links only, only to the two parties', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin);
      const p = await ok(api(seller, 'POST', `/transactions/${deal.id}/photos`, undefined, { form: fileForm({}, { stage: 'handoff' }) }));
      expect(p.url).toContain('/object/sign/condition-photos/');
      expect(p.url).not.toContain('/object/public/');
      const r = await api(outsider, 'GET', `/transactions/${deal.id}`);
      expect([403, 404]).toContain(r.status);
    });
  });
});

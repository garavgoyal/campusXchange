import {
  agreedDeal, api, day, eventually, fileForm, handoff, inbox, liveListing, makeUser, ok, pushesReceived, sql, sqlValue,
  uniqueToken, type TestUser,
} from './e2e/helpers.js';

/** SRS §3.10 Notifications and Category Alerts */
describe('FR-NTF · Notifications and alerts', () => {
  let admin: TestUser;
  let seller: TestUser;
  let buyer: TestUser;

  beforeAll(async () => {
    admin = await makeUser('Admin', { admin: true });
    seller = await makeUser('Seller');
    buyer = await makeUser('Buyer');
  });

  describe('FR-NTF-1 · stored per user with type, payload and read flag', () => {
    it('FR-NTF-1 · a notification has a type, a payload and starts unread', async () => {
      const l = await liveListing(seller, admin, { type: 'sell', title: 'Ntf-1 kettle', price: 400 });
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      await ok(api(buyer, 'POST', `/chats/${chat.id}/offers`, { offered_price: 350 }));
      const n = (await inbox(seller)).find((x) => x.type === 'new_offer' && x.payload?.chat_id === chat.id);
      expect(n).toMatchObject({ type: 'new_offer', read: false });
      expect(n.payload.title).toMatch(/offer/i);
    });

    it('FR-NTF-1 · unread count, mark one read, mark all read', async () => {
      const before = (await ok(api(seller, 'GET', '/notifications/unread-count'))).unread;
      expect(before).toBeGreaterThan(0);
      const [first] = (await inbox(seller)).filter((x) => !x.read);
      await ok(api(seller, 'POST', `/notifications/${first.id}/read`));
      expect((await ok(api(seller, 'GET', '/notifications/unread-count'))).unread).toBe(before - 1);
      await ok(api(seller, 'POST', '/notifications/read-all'));
      expect((await ok(api(seller, 'GET', '/notifications/unread-count'))).unread).toBe(0);
    });

    it('FR-NTF-1 · nobody can read or mark someone else’s notifications', async () => {
      const [theirs] = await inbox(seller);
      expect((await inbox(buyer)).some((x) => x.id === theirs.id)).toBe(false);
      await api(buyer, 'POST', `/notifications/${theirs.id}/read`);
      await sql(`update notifications set read = false where id = $1`, [theirs.id]);
      await api(buyer, 'POST', `/notifications/${theirs.id}/read`);
      expect(await sqlValue(`select read from notifications where id = $1`, [theirs.id])).toBe(false);
    });
  });

  describe('FR-NTF-2 · listing decisions, messages, offers, deal and dispute updates', () => {
    it('FR-NTF-2 · a buyer is told about offers, the deal, payment and the handoff', async () => {
      const l = await liveListing(seller, admin, { type: 'sell', title: 'Ntf-2 full deal', price: 300 });
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      await ok(api(seller, 'POST', `/chats/${chat.id}/messages`, { content: 'Hi! Still available.' }));
      const counter = await ok(api(seller, 'POST', `/chats/${chat.id}/offers`, { offered_price: 300 }));
      await ok(api(buyer, 'POST', `/chats/offers/${counter.id}/accept`));
      const deal = await ok(api(seller, 'POST', '/transactions', { chat_id: chat.id, meeting_location: 'Main Gate' }));
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      await ok(handoff(deal.id, seller, buyer));
      const types = new Set((await inbox(buyer)).map((n) => n.type));
      for (const t of ['new_message', 'new_offer', 'deal_created', 'handoff_complete']) expect(types, t).toContain(t);
      const sellerTypes = new Set((await inbox(seller)).map((n) => n.type));
      for (const t of ['offer_accepted', 'payment_held', 'listing_approved']) expect(sellerTypes, t).toContain(t);
    });

    it('FR-NTF-2 · the deal notice says where to meet', async () => {
      const n = (await inbox(buyer)).find((x) => x.type === 'deal_created');
      expect(n.payload.body).toContain('Meeting point: Main Gate');
    });
  });

  describe('FR-NTF-3 · category alerts and exchange matching', () => {
    it('FR-NTF-3 · a student subscribed to a category hears when a listing in it goes live', async () => {
      const fan = await makeUser('CategoryFan');
      await ok(api(fan, 'PUT', '/notifications/subscriptions', { categories: ['Cycles'] }));
      expect((await ok(api(fan, 'GET', '/notifications/subscriptions'))).categories).toEqual(['Cycles']);
      const l = await liveListing(seller, admin, { type: 'sell', title: 'Ntf-3 Hero cycle', category: 'Cycles', price: 2500 });
      expect((await inbox(fan)).some((n) => n.type === 'category_alert' && n.payload?.listing_id === l.id)).toBe(true);
    });

    it('FR-NTF-3 · no alert for other categories, nor for your own listing', async () => {
      const fan = await makeUser('OtherFan');
      await ok(api(fan, 'PUT', '/notifications/subscriptions', { categories: ['Books'] }));
      await liveListing(seller, admin, { type: 'sell', title: 'Ntf-3 not books', category: 'Sports', price: 10 });
      const own = await liveListing(fan, admin, { type: 'sell', title: 'Ntf-3 own book', category: 'Books', price: 10 });
      const alerts = (await inbox(fan)).filter((n) => n.type === 'category_alert');
      expect(alerts.some((n) => n.payload?.listing_id === own.id)).toBe(false);
      expect(alerts).toHaveLength(0);
    });

    it('FR-NTF-3 · an exchange listing lists live items that fit its want-tags, and says which tag matched', async () => {
      const swapper = await makeUser('Swapper');
      const kettle = await liveListing(seller, admin, { type: 'sell', title: 'Ntf-3 electric kettle', category: 'Electronics', price: 450 });
      const swap = await liveListing(swapper, admin, { type: 'exchange', title: 'Ntf-3 racket', category: 'Sports', want_tags: ['kettle'] });
      const matches = await ok(api(swapper, 'GET', `/listings/${swap.id}/matches`));
      const m = matches.find((x: any) => x.id === kettle.id);
      expect(m?.matched_tags).toEqual(['kettle']);
      expect((await inbox(swapper)).some((n) => n.type === 'exchange_match' && /match your swap/.test(n.payload?.title))).toBe(true);
      expect((await inbox(seller)).some((n) => n.type === 'exchange_match' && n.payload?.listing_id === swap.id)).toBe(true);
    });

    it('FR-NTF-3 · a new listing that fits alerts the exchange owner', async () => {
      const swapper = await makeUser('Swapper2');
      await liveListing(swapper, admin, { type: 'exchange', title: 'Ntf-3 wants a drafter', category: 'Sports', want_tags: ['drafter'] });
      const drafter = await liveListing(seller, admin, { type: 'sell', title: 'Ntf-3 mini drafter', category: 'Lab Gear', price: 300 });
      expect((await inbox(swapper)).some((n) => n.type === 'exchange_match' && n.payload?.listing_id === drafter.id)).toBe(true);
    });
  });

  describe('Push notifications to phones (FR-NTF-2 delivery)', () => {
    it('FR-NTF-2 · junk tokens are refused and registering needs sign-in', async () => {
      expect((await api(buyer, 'POST', '/notifications/push-token', { token: 'not-a-token' })).status).toBe(400);
      expect((await api(null, 'POST', '/notifications/push-token', { token: uniqueToken('x') })).status).toBe(401);
    });

    it('FR-NTF-2 · an offer reaches the phone with title, body and the chat to open', async () => {
      const token = uniqueToken('buyer');
      await ok(api(buyer, 'POST', '/notifications/push-token', { token, platform: 'android' }));
      const l = await liveListing(seller, admin, { type: 'sell', title: 'Ntf push kettle', price: 400 });
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      await ok(api(seller, 'POST', `/chats/${chat.id}/offers`, { offered_price: 350 }));
      const push = await eventually(() => pushesReceived().find((m) => m.to === token && m.data?.chat_id === chat.id));
      expect(push).toMatchObject({ title: expect.stringMatching(/^New offer/), data: { type: 'new_offer', chat_id: chat.id } });
      expect(push.body).toContain('₹350');
      await ok(api(buyer, 'DELETE', '/notifications/push-token', { token }));
      expect(await sqlValue(`select count(*)::int from push_tokens where token = $1`, [token])).toBe(0);
    });

    it('FR-NTF-2 · the token of an uninstalled app is removed after Expo rejects it', async () => {
      const dead = uniqueToken('DEAD');
      await ok(api(seller, 'POST', '/notifications/push-token', { token: dead, platform: 'ios' }));
      const l = await liveListing(seller, admin, { type: 'sell', title: 'Ntf push dead', price: 400 });
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      await ok(api(buyer, 'POST', `/chats/${chat.id}/offers`, { offered_price: 360 }));
      const gone = await eventually(async () => (await sqlValue<number>(`select count(*)::int from push_tokens where token = $1`, [dead])) === 0);
      expect(gone).toBe(true);
    });
  });
});

/** SRS §3.11 Administration */
describe('FR-ADM · Administration', () => {
  let admin: TestUser;
  let student: TestUser;

  beforeAll(async () => {
    admin = await makeUser('Admin', { admin: true });
    student = await makeUser('Student');
  });

  describe('FR-ADM-2 · every /admin call re-checks the admin role on the server', () => {
    const routes: [string, string, unknown?][] = [
      ['GET', '/admin/stats'],
      ['GET', '/admin/moderation'],
      ['POST', '/admin/moderation/00000000-0000-0000-0000-000000000000/approve'],
      ['POST', '/admin/moderation/00000000-0000-0000-0000-000000000000/reject', { reason: 'x' }],
      ['GET', '/admin/id-verifications'],
      ['POST', '/admin/id-verifications/00000000-0000-0000-0000-000000000000', { decision: 'verified' }],
      ['GET', '/admin/disputes'],
      ['GET', '/admin/disputes/penalty-tiers'],
      ['POST', '/admin/disputes/00000000-0000-0000-0000-000000000000/resolve', { outcome: 'refund', resolution: 'x' }],
    ];

    it.each(routes)('FR-ADM-2 · student %s %s → 403', async (method, path, body) => {
      expect((await api(student, method, path, body)).status).toBe(403);
    });

    it.each(routes)('FR-ADM-2 · guest %s %s → 401', async (method, path, body) => {
      expect((await api(null, method, path, body)).status).toBe(401);
    });

    it('FR-ADM-2 · demoting an admin takes effect on their very next request', async () => {
      const temp = await makeUser('TempAdmin', { admin: true });
      expect((await api(temp, 'GET', '/admin/stats')).status).toBe(200);
      await sql(`update users set role = 'student' where id = $1`, [temp.id]);
      expect((await api(temp, 'GET', '/admin/stats')).status).toBe(403);
    });
  });

  describe('FR-ADM-3 · pending ID cards through 10-minute signed links', () => {
    it('FR-ADM-3 · pending ID cards are listed with a signed URL valid for 600 seconds', async () => {
      const s = await makeUser('NeedsCheck', { verified: false });
      await ok(api(s, 'POST', '/profile/id-card', undefined, { form: fileForm() }));
      const list = await ok(api(admin, 'GET', '/admin/id-verifications'));
      const entry = list.find((x: any) => x.id === s.id);
      expect(entry).toBeTruthy();
      const url = entry.id_card_url ?? entry.signed_url ?? entry.url;
      expect(url).toContain('/object/sign/id-cards/');
      expect(url).toContain('expires_in=600');
    });

    it('FR-ADM-3 · the ID card is not reachable as a public file', async () => {
      const s = await makeUser('Private', { verified: false });
      const { path } = await ok(api(s, 'POST', '/profile/id-card', undefined, { form: fileForm() }));
      const gateway = process.env.E2E_GATEWAY_URL ?? `http://127.0.0.1:${process.env.E2E_GATEWAY_PORT ?? 54329}`;
      const r = await fetch(`${gateway}/storage/v1/object/id-cards/${path}`);
      expect(r.status).not.toBe(200);
    });
  });

  describe('FR-ADM-4 · verify or reject an ID card', () => {
    it('FR-ADM-4 · verifying lets the student post; rejecting blocks them', async () => {
      const s = await makeUser('Decide', { verified: false });
      await ok(api(s, 'POST', '/profile/id-card', undefined, { form: fileForm() }));
      const post = () => api(s, 'POST', '/listings', { type: 'sell', title: 'After verify', category: 'Books', price: 10, meeting_location: 'Library' });
      expect((await post()).status).toBe(403);
      await ok(api(admin, 'POST', `/admin/id-verifications/${s.id}`, { decision: 'verified' }));
      expect((await post()).status).toBe(201);
      await ok(api(admin, 'POST', `/admin/id-verifications/${s.id}`, { decision: 'rejected' }));
      expect((await post()).status).toBe(403);
    });

    it('FR-ADM-4 · only verified or rejected are accepted', async () => {
      const r = await api(admin, 'POST', `/admin/id-verifications/${student.id}`, { decision: 'admin' });
      expect(r.status).toBe(400);
      expect(await sqlValue(`select role from users where id = $1`, [student.id])).toBe('student');
    });
  });

  describe('FR-ADM-5 · platform analytics', () => {
    it('FR-ADM-5 · completion rate, lend share, on-time returns and dispute rate match the database', async () => {
      const seller = await makeUser('MetricsSeller');
      const buyer = await makeUser('MetricsBuyer');
      const lamp = await liveListing(seller, admin, { type: 'lend', title: 'Adm-5 lamp', category: 'Electronics', rent_amount: 10, rent_unit: 'day' });
      const { deal } = await agreedDeal(seller, buyer, lamp.id, 10, { start_date: day(0), end_date: day(2), deposit_amount: 0 });
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      await ok(handoff(deal.id, seller, buyer));
      await ok(handoff(deal.id, buyer, seller, 'return'));

      const m = (await ok(api(admin, 'GET', '/admin/stats'))).deals;
      const [t] = await sql(`select count(*)::int as total,
          count(*) filter (where status = 'completed')::int as completed,
          count(*) filter (where status in ('completed', 'cancelled', 'refunded'))::int as ended,
          count(*) filter (where type = 'lend')::int as lend
        from transactions`);
      expect(m.completed).toBe(t.completed);
      expect(m.ended).toBe(t.ended);
      expect(m.completion_rate_percent).toBe(Math.round((t.completed / t.ended) * 100));
      expect(m.lend_share_percent).toBe(Math.round((t.lend / t.total) * 100));
      expect(m.lend_returned_on_time).toBeGreaterThanOrEqual(1);
      expect(m.on_time_return_percent).toBe(Math.round((m.lend_returned_on_time / m.lend_due) * 100));
      expect(m.dispute_rate_percent).toBe(Math.round((m.disputed / m.total) * 100));
    });

    it('FR-ADM-5 · a late return lowers the on-time count', async () => {
      const before = (await ok(api(admin, 'GET', '/admin/stats'))).deals.lend_returned_on_time;
      const late = await sqlValue(`select t.id from transactions t join lend_details d on d.transaction_id = t.id where t.status = 'completed' order by t.completed_at desc limit 1`);
      await sql(`update lend_details set end_date = (now() - interval '3 days')::date where transaction_id = $1`, [late]);
      const after = (await ok(api(admin, 'GET', '/admin/stats'))).deals.lend_returned_on_time;
      expect(after).toBe(before - 1);
    });

    it('FR-ADM-5 · listing volume by type and median clearance time are reported', async () => {
      const s = await ok(api(admin, 'GET', '/admin/stats'));
      expect(s.listings_by_type).toHaveProperty('lend');
      expect(s.clearance).toHaveProperty('median_minutes');
    });
  });

  describe('FR-ADM-1 / FR-ADM-6 · app screens', () => {
    it.todo('FR-ADM-1 · the Review tab shows only for admins — manual test MT-ADM-1');
    it.todo('FR-ADM-6 · the admin dashboard in a web browser — manual test MT-ADM-6');
  });
});

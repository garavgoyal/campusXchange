import {
  agreedDeal, api, day, handoff, inbox, liveListing, makeUser, msg, ok, sql, sqlValue, type TestUser,
} from './e2e/helpers.js';

/** SRS §3.4 Listing Moderation — reports and takedown of live listings. */
describe('FR-MOD-8 to FR-MOD-10 · Reports and takedown', () => {
  let admin: TestUser;
  let owner: TestUser;
  let student: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    admin = await makeUser('Admin', { admin: true });
    owner = await makeUser('Owner');
    student = await makeUser('Student');
    other = await makeUser('Other');
  });

  const report = (user: TestUser, body: Record<string, unknown>) => api(user, 'POST', '/reports', body);
  const openReports = async () => (await ok(api(admin, 'GET', '/admin/reports'))) as any[];

  describe('FR-MOD-8 · students report a listing or a person', () => {
    it('FR-MOD-8 · a student reports a live listing with a reason and details', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Suspicious iPhone', price: 2000 });
      const r = await report(student, { listing_id: l.id, reason: 'scam', details: 'Price is far too low, asks for UPI first.' });
      expect(r.status, msg(r)).toBe(201);
      expect(r.body).toMatchObject({ listing_id: l.id, reason: 'scam', status: 'open', listing_title: 'Suspicious iPhone' });
    });

    it('FR-MOD-8 · a student reports someone they have chatted with', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Report-a-person lamp', price: 300 });
      await ok(api(student, 'POST', '/chats', { listing_id: l.id }));
      const r = await report(student, { user_id: owner.id, reason: 'offensive', details: 'Abusive messages in chat.' });
      expect(r.status, msg(r)).toBe(201);
      expect(r.body.reported_user_id).toBe(owner.id);
    });

    it('FR-MOD-8 · you cannot report someone you have never dealt with', async () => {
      const stranger = await makeUser('Stranger');
      expect((await report(stranger, { user_id: owner.id, reason: 'other' })).status).toBe(403);
    });

    it('FR-MOD-8 · you cannot report your own listing or yourself', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Own report', price: 10 });
      expect((await report(owner, { listing_id: l.id, reason: 'fake' })).status).toBe(400);
      expect((await report(owner, { user_id: owner.id, reason: 'fake' })).status).toBe(400);
    });

    it('FR-MOD-8 · one open report per student per listing', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Report twice', price: 10 });
      await ok(report(other, { listing_id: l.id, reason: 'fake' }));
      const again = await report(other, { listing_id: l.id, reason: 'scam' });
      expect(again.status).toBe(400);
      expect(msg(again)).toMatch(/already reported/);
    });

    it('FR-MOD-8 · a report needs exactly one target and a known reason', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Bad report body', price: 10 });
      expect((await report(student, { reason: 'scam' })).status).toBe(400);
      expect((await report(student, { listing_id: l.id, user_id: owner.id, reason: 'scam' })).status).toBe(400);
      expect((await report(student, { listing_id: l.id, reason: 'boring' })).status).toBe(400);
    });

    it('FR-MOD-8 · a listing nobody else can see (pending review) cannot be reported; guests cannot report', async () => {
      const pending = await ok(api(owner, 'POST', '/listings', { type: 'sell', title: 'Still pending', category: 'Books', price: 5, meeting_location: 'Library' }));
      expect((await report(student, { listing_id: pending.id, reason: 'fake' })).status).toBe(404);
      expect((await api(null, 'POST', '/reports', { listing_id: pending.id, reason: 'fake' })).status).toBe(401);
    });
  });

  describe('FR-MOD-9 · admins review reports and take listings down', () => {
    it('FR-MOD-9 · the report queue shows what was reported, by whom, and how many reports it has', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Queue target', price: 50 });
      await ok(report(student, { listing_id: l.id, reason: 'prohibited', details: 'Selling a vape.' }));
      await ok(report(other, { listing_id: l.id, reason: 'prohibited' }));
      const entry = (await openReports()).find((r) => r.listing_id === l.id && r.reporter_id === student.id);
      expect(entry).toMatchObject({ reason_label: 'Prohibited item', details: 'Selling a vape.', open_reports_on_target: 2 });
      expect(entry.listing).toMatchObject({ id: l.id, title: 'Queue target', status: 'live' });
      expect(entry.listing.owner.id).toBe(owner.id);
      expect(entry.reporter.id).toBe(student.id);
    });

    it('FR-MOD-9 · acting on a listing report takes the listing down and closes every open report on it', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Take me down', price: 50 });
      await ok(report(student, { listing_id: l.id, reason: 'scam' }));
      await ok(report(other, { listing_id: l.id, reason: 'fake' }));
      const r = (await openReports()).find((x) => x.listing_id === l.id);
      await ok(api(admin, 'POST', `/admin/reports/${r.id}/resolve`, { outcome: 'actioned', note: 'Confirmed scam listing.' }));
      const [row] = await sql(`select status, taken_down_reason, taken_down_by from listings where id = $1`, [l.id]);
      expect(row).toEqual({ status: 'removed', taken_down_reason: 'Confirmed scam listing.', taken_down_by: admin.id });
      expect(await sqlValue(`select count(*)::int from reports where listing_id = $1 and status = 'open'`, [l.id])).toBe(0);
      const feed = await ok(api(null, 'GET', `/listings?type=sell&search=${encodeURIComponent('Take me down')}`));
      expect(feed).toHaveLength(0);
    });

    it('FR-MOD-9 · an admin can take down a live listing without any report', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Direct takedown', price: 50 });
      const r = await ok(api(admin, 'POST', `/admin/listings/${l.id}/takedown`, { reason: 'Counterfeit brand item.' }));
      expect(r).toMatchObject({ status: 'removed', cancelled_deals: 0 });
    });

    it('FR-MOD-9 · a taken-down listing can never come back: not by re-approval, not by an edit', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Stay down', price: 50 });
      await ok(api(admin, 'POST', `/admin/listings/${l.id}/takedown`, { reason: 'Prohibited item.' }));
      expect((await api(admin, 'POST', `/admin/moderation/${l.id}/approve`)).status).toBe(400);
      expect((await api(owner, 'PATCH', `/listings/${l.id}`, { title: 'Stay down (fixed)' })).status).toBe(400);
      // Even a direct database write cannot put it back live.
      await sql(`update listings set status = 'live' where id = $1`, [l.id]);
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('removed');
    });

    it('FR-MOD-9 · a deal waiting for the handoff is called off and the buyer refunded', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Reserved takedown', price: 900 });
      const { deal } = await agreedDeal(owner, student, l.id, 900);
      await ok(api(student, 'POST', `/transactions/${deal.id}/pay`));
      const r = await ok(api(admin, 'POST', `/admin/listings/${l.id}/takedown`, { reason: 'Item is stolen property.' }));
      expect(r.cancelled_deals).toBe(1);
      const d = await ok(api(student, 'GET', `/transactions/${deal.id}`));
      expect(d.status).toBe('refunded');
      expect(Number(d.escrow.refunded_to_buyer)).toBe(900);
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('removed');
    });

    it('FR-MOD-9 · a lend already handed over is left to finish, and the listing does not return to the feed after it', async () => {
      const l = await liveListing(owner, admin, { type: 'lend', title: 'Lend takedown', category: 'Electronics', rent_amount: 10, rent_unit: 'day' });
      const { deal } = await agreedDeal(owner, student, l.id, 10, { start_date: day(0), end_date: day(2), deposit_amount: 0 });
      await ok(api(student, 'POST', `/transactions/${deal.id}/pay`));
      await ok(handoff(deal.id, owner, student));
      const r = await ok(api(admin, 'POST', `/admin/listings/${l.id}/takedown`, { reason: 'Unsafe electrical item.' }));
      expect(r).toMatchObject({ cancelled_deals: 0, open_deals: 1 });
      const done = await ok(handoff(deal.id, student, owner, 'return'));
      expect(done.status).toBe('completed');
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('removed');
    });

    it('FR-MOD-9 · dismissing a report leaves the listing live', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Fine listing', price: 50 });
      await ok(report(other, { listing_id: l.id, reason: 'wrong_info' }));
      const r = (await openReports()).find((x) => x.listing_id === l.id);
      await ok(api(admin, 'POST', `/admin/reports/${r.id}/resolve`, { outcome: 'dismissed', note: 'Details match the photos.' }));
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('live');
      expect(await sqlValue(`select status from reports where id = $1`, [r.id])).toBe('dismissed');
    });

    it('FR-MOD-9 · a decision needs a note and cannot be made twice', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Decide twice', price: 50 });
      await ok(report(student, { listing_id: l.id, reason: 'other' }));
      const r = (await openReports()).find((x) => x.listing_id === l.id);
      expect((await api(admin, 'POST', `/admin/reports/${r.id}/resolve`, { outcome: 'dismissed', note: '' })).status).toBe(400);
      await ok(api(admin, 'POST', `/admin/reports/${r.id}/resolve`, { outcome: 'dismissed', note: 'Nothing wrong.' }));
      expect((await api(admin, 'POST', `/admin/reports/${r.id}/resolve`, { outcome: 'actioned', note: 'Changed my mind.' })).status).toBe(400);
    });

    it('FR-MOD-9 · only admins see reports or take listings down', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Student takedown', price: 50 });
      expect((await api(student, 'GET', '/admin/reports')).status).toBe(403);
      expect((await api(student, 'POST', `/admin/listings/${l.id}/takedown`, { reason: 'I do not like it.' })).status).toBe(403);
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('live');
    });

    it('FR-MOD-9 · moderation can no longer reject or re-approve a live listing (takedown is the only way)', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Live reject', price: 50 });
      expect((await api(admin, 'POST', `/admin/moderation/${l.id}/reject`, { reason: 'x' })).status).toBe(400);
      expect((await api(admin, 'POST', `/admin/moderation/${l.id}/approve`)).status).toBe(400);
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('live');
    });

    it('FR-MOD-9 · the dashboard counts open reports', async () => {
      const stats = await ok(api(admin, 'GET', '/admin/stats'));
      expect(stats.reports_open).toBe(await sqlValue<number>(`select count(*)::int from reports where status = 'open'`));
    });
  });

  describe('FR-MOD-10 · everyone involved is told', () => {
    it('FR-MOD-10 · admins hear about a new report; the owner hears why the listing was taken down; reporters hear it was acted on', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Notify takedown', price: 50 });
      const rep = await ok(report(student, { listing_id: l.id, reason: 'scam' }));
      expect((await inbox(admin)).some((n) => n.type === 'report_opened' && n.payload?.report_id === rep.id)).toBe(true);
      await ok(api(admin, 'POST', `/admin/reports/${rep.id}/resolve`, { outcome: 'actioned', note: 'Asked buyers to pay outside the app.' }));
      const ownerNote = (await inbox(owner)).find((n) => n.type === 'listing_removed' && n.payload?.listing_id === l.id);
      expect(ownerNote?.payload?.body).toContain('Asked buyers to pay outside the app.');
      expect((await inbox(student)).some((n) => n.type === 'report_update' && n.payload?.listing_id === l.id)).toBe(true);
    });

    it('FR-MOD-10 · the owner sees the takedown reason under My listings', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Reason in My listings', price: 50 });
      await ok(api(admin, 'POST', `/admin/listings/${l.id}/takedown`, { reason: 'Duplicate of another listing.' }));
      const mine = await ok(api(owner, 'GET', '/listings/mine'));
      expect(mine.find((x: any) => x.id === l.id)).toMatchObject({ status: 'removed', taken_down_reason: 'Duplicate of another listing.' });
    });

    it('FR-MOD-10 · the owner sees the reason on the listing itself, and can no longer edit it', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Reason on detail', price: 50 });
      await ok(api(admin, 'POST', `/admin/listings/${l.id}/takedown`, { reason: 'Prohibited item.' }));
      const detail = await ok(api(owner, 'GET', `/listings/${l.id}`));
      expect(detail).toMatchObject({ status: 'removed', taken_down_reason: 'Prohibited item.' });
      expect((await api(student, 'GET', `/listings/${l.id}`)).status).toBe(404);
    });

    it('FR-MOD-10 · both sides of a cancelled deal are told why', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Notify deal cancel', price: 100 });
      const { deal } = await agreedDeal(owner, other, l.id, 100);
      await ok(api(admin, 'POST', `/admin/listings/${l.id}/takedown`, { reason: 'Prohibited item.' }));
      for (const u of [owner, other]) {
        const n = (await inbox(u)).find((x) => x.type === 'deal_cancelled' && x.payload?.transaction_id === deal.id);
        expect(n?.payload?.title, u.name).toBe('Deal cancelled by an admin');
      }
    });

    it('FR-MOD-10 · a dismissed report tells the reporter', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Notify dismiss', price: 50 });
      const rep = await ok(report(other, { listing_id: l.id, reason: 'wrong_info' }));
      await ok(api(admin, 'POST', `/admin/reports/${rep.id}/resolve`, { outcome: 'dismissed', note: 'Looks fine.' }));
      expect((await inbox(other)).some((n) => n.type === 'report_update' && n.payload?.report_id === rep.id)).toBe(true);
    });
  });
});

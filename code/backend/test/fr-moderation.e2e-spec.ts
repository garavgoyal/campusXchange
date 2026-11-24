import { api, inbox, makeUser, ok, sql, sqlValue, uploadPhoto, type TestUser } from './e2e/helpers.js';

/** SRS §3.4 Listing Moderation */
describe('FR-MOD · Listing moderation', () => {
  let admin: TestUser;
  let owner: TestUser;
  let student: TestUser;

  beforeAll(async () => {
    admin = await makeUser('Admin', { admin: true });
    owner = await makeUser('Owner');
    student = await makeUser('Student');
  });

  const submit = async (title: string, extra: Record<string, unknown> = {}) =>
    ok(api(owner, 'POST', '/listings', {
      type: 'sell', title, category: 'Electronics', price: 100, meeting_location: 'Library', ...extra,
    }));

  describe('FR-MOD-1 · every new listing joins the moderation queue', () => {
    it('FR-MOD-1 · a queue entry with status pending is created with the listing', async () => {
      const l = await submit('Queue me');
      const rows = await sql(`select status from moderation_queue where listing_id = $1`, [l.id]);
      expect(rows).toEqual([{ status: 'pending' }]);
    });

    it('FR-MOD-1 · listing and queue entry are created together (no listing without one)', async () => {
      const orphans = await sqlValue<number>(
        `select count(*)::int from listings l
          where l.status = 'pending_review'
            and not exists (select 1 from moderation_queue q where q.listing_id = l.id and q.status = 'pending')`,
      );
      expect(orphans).toBe(0);
    });
  });

  describe('FR-MOD-2 · admins see the pending queue with full details', () => {
    it('FR-MOD-2 · the queue shows the listing with its details and photos', async () => {
      const photo = await uploadPhoto(owner);
      const l = await submit('Arduino kit', { description: 'Uno R3 with sensors', images: [photo] });
      const queue = await ok(api(admin, 'GET', '/admin/moderation'));
      const entry = queue.find((q: any) => (q.listing?.id ?? q.listing_id) === l.id);
      expect(entry, 'listing is in the queue').toBeTruthy();
      expect(entry.listing).toMatchObject({ title: 'Arduino kit', description: 'Uno R3 with sensors', images: [photo] });
    });

    it('FR-MOD-2 · only pending entries are listed', async () => {
      const queue = await ok(api(admin, 'GET', '/admin/moderation'));
      expect(queue.every((q: any) => (q.status ?? 'pending') === 'pending')).toBe(true);
    });

    it('FR-MOD-2 · a student cannot open the queue', async () => {
      expect((await api(student, 'GET', '/admin/moderation')).status).toBe(403);
    });
  });

  describe('FR-MOD-3 · approve', () => {
    it('FR-MOD-3 · approving sets the listing live and records reviewer and time', async () => {
      const l = await submit('Approve me');
      await ok(api(admin, 'POST', `/admin/moderation/${l.id}/approve`));
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('live');
      const [q] = await sql(`select status, reviewed_by, reviewed_at from moderation_queue where listing_id = $1`, [l.id]);
      expect(q.status).toBe('approved');
      expect(q.reviewed_by).toBe(admin.id);
      expect(q.reviewed_at).toBeInstanceOf(Date);
    });

    it('FR-MOD-3 · a student cannot approve', async () => {
      const l = await submit('Self approve');
      expect((await api(owner, 'POST', `/admin/moderation/${l.id}/approve`)).status).toBe(403);
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('pending_review');
    });
  });

  describe('FR-MOD-4 · reject with a reason', () => {
    it('FR-MOD-4 · rejecting sets the listing removed and stores the reason', async () => {
      const l = await submit('Reject me');
      await ok(api(admin, 'POST', `/admin/moderation/${l.id}/reject`, { reason: 'Photo is unclear' }));
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('removed');
      const [q] = await sql(`select * from moderation_queue where listing_id = $1`, [l.id]);
      expect(q.status).toBe('rejected');
      expect(JSON.stringify(q)).toContain('Photo is unclear');
    });

    it('FR-MOD-4 · the rejected listing is not on the feed', async () => {
      const l = await submit('Rejected feed check');
      await ok(api(admin, 'POST', `/admin/moderation/${l.id}/reject`, { reason: 'Not allowed' }));
      const feed = await ok(api(null, 'GET', `/listings?type=sell&search=${encodeURIComponent('Rejected feed check')}`));
      expect(feed).toHaveLength(0);
    });
  });

  describe('FR-MOD-5 · timestamps for time-to-listing-clearance', () => {
    it('FR-MOD-5 · submission and decision times are stored, decision after submission', async () => {
      const l = await submit('Timed');
      await ok(api(admin, 'POST', `/admin/moderation/${l.id}/approve`));
      const [q] = await sql(`select created_at, reviewed_at from moderation_queue where listing_id = $1`, [l.id]);
      expect(q.created_at).toBeInstanceOf(Date);
      expect(q.reviewed_at.getTime()).toBeGreaterThanOrEqual(q.created_at.getTime());
    });

    it('FR-MOD-5 · the admin dashboard turns them into a median clearance time', async () => {
      const l = await submit('Timed 95');
      await ok(api(admin, 'POST', `/admin/moderation/${l.id}/approve`));
      // Everything this test file approved took 95 minutes.
      await sql(`update moderation_queue set created_at = reviewed_at - interval '95 minutes' where status = 'approved'`);
      const stats = await ok(api(admin, 'GET', '/admin/stats'));
      expect(stats.clearance.median_minutes).toBe(95);
      expect(stats.clearance.reviewed).toBeGreaterThan(0);
    });
  });

  describe('FR-MOD-6 · the owner is told the decision', () => {
    it('FR-MOD-6 · approval notifies the owner', async () => {
      const l = await submit('Notify approve');
      await ok(api(admin, 'POST', `/admin/moderation/${l.id}/approve`));
      const n = (await inbox(owner)).find((x) => x.type === 'listing_approved' && x.payload?.listing_id === l.id);
      expect(n, 'approval notification').toBeTruthy();
    });

    it('FR-MOD-6 · rejection notifies the owner with the reason', async () => {
      const l = await submit('Notify reject');
      await ok(api(admin, 'POST', `/admin/moderation/${l.id}/reject`, { reason: 'Prohibited item' }));
      const n = (await inbox(owner)).find((x) => x.type === 'listing_rejected' && x.payload?.listing_id === l.id);
      expect(n, 'rejection notification').toBeTruthy();
      expect(JSON.stringify(n.payload)).toContain('Prohibited item');
    });
  });

  describe('FR-MOD-7 · AI moderation score (planned)', () => {
    it.todo('FR-MOD-7 · not built for the pilot: every listing gets human review (ai_flag_score stays empty)');

    it('FR-MOD-7 · no listing is ever auto-rejected: ai_flag_score is empty on new listings', async () => {
      const l = await submit('No AI score');
      expect(await sqlValue(`select ai_flag_score from moderation_queue where listing_id = $1`, [l.id])).toBeNull();
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('pending_review');
    });
  });
});

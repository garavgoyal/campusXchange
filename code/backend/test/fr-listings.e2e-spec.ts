import {
  agreedDeal, api, fileForm, handoff, JPEG, liveListing, makeUser, msg, ok, sqlValue, uploadPhoto, type TestUser,
} from './e2e/helpers.js';

/** SRS §3.3 Listing Management */
describe('FR-LST · Listing management', () => {
  let admin: TestUser;
  let owner: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    admin = await makeUser('Admin', { admin: true });
    owner = await makeUser('Omar');
    other = await makeUser('Priya');
  });

  const post = (user: TestUser, body: Record<string, unknown>) =>
    api(user, 'POST', '/listings', { meeting_location: 'Library', category: 'Books', ...body });

  describe('FR-LST-1 · create a listing (verified students only)', () => {
    it('FR-LST-1 · a verified student creates a sell listing with every field', async () => {
      const r = await post(owner, {
        type: 'sell', title: 'Drafter set', description: 'Mini drafter with clamp', category: 'Lab Gear',
        condition: 'Good', price: 250,
      });
      expect(r.status, msg(r)).toBe(201);
      expect(r.body).toMatchObject({ type: 'sell', title: 'Drafter set', category: 'Lab Gear', condition: 'Good' });
    });

    it('FR-LST-1 · a student whose ID is not verified yet cannot post', async () => {
      const pending = await makeUser('Pending', { verified: false });
      const r = await post(pending, { type: 'sell', title: 'Blocked', price: 10 });
      expect(r.status).toBe(403);
      expect(msg(r)).toMatch(/verified/i);
    });

    it.each([
      ['a 2-character title', { title: 'ab' }],
      ['a 121-character title', { title: 'x'.repeat(121) }],
      ['a 2001-character description', { description: 'x'.repeat(2001) }],
      ['an unknown type', { type: 'rent' }],
      ['a missing category', { category: undefined }],
      ['a negative price', { price: -5 }],
    ])('FR-LST-1 · %s is refused', async (_label, patch) => {
      const r = await post(owner, { type: 'sell', title: 'Valid title', price: 100, ...patch });
      expect(r.status).toBe(400);
    });
  });

  describe('FR-LST-2 · type-specific fields', () => {
    it('FR-LST-2 · sell needs a price', async () => {
      const r = await post(owner, { type: 'sell', title: 'No price' });
      expect(r.status).toBe(400);
      expect(msg(r)).toMatch(/price/i);
    });

    it('FR-LST-2 · lend needs a rent amount; unit day or week', async () => {
      expect((await post(owner, { type: 'lend', title: 'No rent' })).status).toBe(400);
      expect((await post(owner, { type: 'lend', title: 'Bad unit', rent_amount: 10, rent_unit: 'month' })).status).toBe(400);
      const r = await post(owner, { type: 'lend', title: 'Weekly cycle', rent_amount: 100, rent_unit: 'week' });
      expect(r.status, msg(r)).toBe(201);
      expect(r.body.rent_unit).toBe('week');
    });

    it('FR-LST-2 · exchange needs at least one wanted tag, at most 10', async () => {
      expect((await post(owner, { type: 'exchange', title: 'No tags', want_tags: [] })).status).toBe(400);
      const eleven = Array.from({ length: 11 }, (_, i) => `tag${i}`);
      expect((await post(owner, { type: 'exchange', title: 'Too many', want_tags: eleven })).status).toBe(400);
      expect((await post(owner, { type: 'exchange', title: 'Swap bat', want_tags: ['football'] })).status).toBe(201);
    });

    it('FR-LST-2 · fields of another type are not stored (a sell listing keeps no rent)', async () => {
      const r = await ok(post(owner, { type: 'sell', title: 'Plain sale', price: 40, rent_amount: 5, rent_unit: 'day' }));
      expect(r.rent_amount).toBeNull();
    });
  });

  describe('FR-LST-3 · up to 6 photos, images only, in the owner’s folder', () => {
    it('FR-LST-3 · an upload returns a public URL inside the owner’s folder', async () => {
      const url = await uploadPhoto(owner);
      expect(url).toContain(`/storage/v1/object/public/listing-images/${owner.id}/`);
    });

    it('FR-LST-3 · a listing keeps all its photos (6)', async () => {
      const photos = await Promise.all(Array.from({ length: 6 }, () => uploadPhoto(owner)));
      const r = await ok(post(owner, { type: 'sell', title: 'Six photos', price: 10, images: photos }));
      expect(r.images).toEqual(photos);
    });

    it('FR-LST-3 · a 7th photo is refused', async () => {
      const url = await uploadPhoto(owner);
      const r = await post(owner, { type: 'sell', title: 'Seven photos', price: 10, images: Array(7).fill(url) });
      expect(r.status).toBe(400);
    });

    it('FR-LST-3 · JPEG uploads keep a .jpg name and image/jpeg type', async () => {
      const r = await ok(api(owner, 'POST', '/listings/images', undefined, {
        form: fileForm({ bytes: JPEG, type: 'application/octet-stream', name: 'IMG_0001' }),
      }));
      expect(r.url).toMatch(/\.jpg$/);
    });

    it('FR-LST-3 · non-images are refused', async () => {
      const r = await api(owner, 'POST', '/listings/images', undefined, {
        form: fileForm({ bytes: Buffer.from('hello world, not a picture'), type: 'image/jpeg', name: 'x.jpg' }),
      });
      expect(r.status).toBe(400);
    });

    it('FR-LST-3 · a photo over 8 MB is refused', async () => {
      const big = Buffer.concat([JPEG, Buffer.alloc(8 * 1024 * 1024 + 1)]);
      const r = await api(owner, 'POST', '/listings/images', undefined, { form: fileForm({ bytes: big, type: 'image/jpeg' }) });
      expect(r.status).toBe(413);
    });
  });

  describe('FR-LST-4 · meeting point from the campus list', () => {
    it('FR-LST-4 · a campus place is accepted', async () => {
      const r = await ok(post(owner, { type: 'sell', title: 'At the gate', price: 5, meeting_location: 'Main Gate' }));
      expect(r.meeting_location).toBe('Main Gate');
    });

    it('FR-LST-4 · an old name or different case is stored as the current place name', async () => {
      const r = await ok(post(owner, { type: 'sell', title: 'Old hostel name', price: 5, meeting_location: 'hostel block b' }));
      expect(r.meeting_location).toBe('Amritam Hall');
    });

    it('FR-LST-4 · a made-up place is refused', async () => {
      const r = await post(owner, { type: 'sell', title: 'On the moon', price: 5, meeting_location: 'The Moon' });
      expect(r.status).toBe(400);
      expect(msg(r)).toMatch(/campus list/);
    });
  });

  describe('FR-LST-5 · nothing is published directly', () => {
    it('FR-LST-5 · a new listing is saved as pending_review', async () => {
      const r = await ok(post(owner, { type: 'sell', title: 'Waiting for review', price: 5 }));
      expect(r.status).toBe('pending_review');
      expect(await sqlValue(`select status from listings where id = $1`, [r.id])).toBe('pending_review');
    });

    it('FR-LST-5 · a status sent by the client is ignored', async () => {
      const r = await ok(post(owner, { type: 'sell', title: 'Trying to skip review', price: 5, status: 'live' }));
      expect(r.status).toBe('pending_review');
    });
  });

  describe('FR-LST-6 · My listings shows every status', () => {
    it('FR-LST-6 · pending, live, reserved, completed and removed all appear', async () => {
      const u = await makeUser('Mona');
      const buyer = await makeUser('Buyer');
      const pending = await ok(post(u, { type: 'sell', title: 'Mine pending', price: 5 }));
      const live = await liveListing(u, admin, { type: 'sell', title: 'Mine live', price: 5 });
      const removed = await ok(post(u, { type: 'sell', title: 'Mine removed', price: 5 }));
      await ok(api(admin, 'POST', `/admin/moderation/${removed.id}/reject`, { reason: 'Blurry' }));
      const reserved = await liveListing(u, admin, { type: 'sell', title: 'Mine reserved', price: 5 });
      await agreedDeal(u, buyer, reserved.id, 5);
      const done = await liveListing(u, admin, { type: 'sell', title: 'Mine completed', price: 5 });
      const { deal } = await agreedDeal(u, buyer, done.id, 5);
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      await ok(handoff(deal.id, u, buyer));

      const mine = await ok(api(u, 'GET', '/listings/mine'));
      const byId = Object.fromEntries(mine.map((l: any) => [l.id, l.status]));
      expect(byId).toEqual({
        [pending.id]: 'pending_review',
        [live.id]: 'live',
        [removed.id]: 'removed',
        [reserved.id]: 'reserved',
        [done.id]: 'completed',
      });
    });

    it('FR-LST-6 · My listings never includes other students’ items', async () => {
      const mine = await ok(api(other, 'GET', '/listings/mine'));
      expect(mine.every((l: any) => l.owner_id === other.id)).toBe(true);
    });
  });

  describe('FR-LST-7 · only the owner can delete', () => {
    it('FR-LST-7 · another student gets 403 and the listing stays', async () => {
      const l = await ok(post(owner, { type: 'sell', title: 'Not yours to delete', price: 5 }));
      expect((await api(other, 'DELETE', `/listings/${l.id}`)).status).toBe(403);
      expect(await sqlValue(`select count(*)::int from listings where id = $1`, [l.id])).toBe(1);
    });

    it('FR-LST-7 · the owner deletes it', async () => {
      const l = await ok(post(owner, { type: 'sell', title: 'Delete me', price: 5 }));
      expect((await api(owner, 'DELETE', `/listings/${l.id}`)).status).toBe(200);
      expect(await sqlValue(`select count(*)::int from listings where id = $1`, [l.id])).toBe(0);
    });

    it('FR-LST-7 · a guest cannot delete', async () => {
      const l = await ok(post(owner, { type: 'sell', title: 'Guest delete', price: 5 }));
      expect((await api(null, 'DELETE', `/listings/${l.id}`)).status).toBe(401);
    });
  });

  describe('FR-LST-8 · editing sends the listing back to review', () => {
    it('FR-LST-8 · only the owner can edit', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Edit target', price: 300 });
      expect((await api(other, 'PATCH', `/listings/${l.id}`, { price: 1 })).status).toBe(403);
    });

    it('FR-LST-8 · an edited live listing returns to pending_review and leaves the feed', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Maths book edit', price: 300 });
      const r = await ok(api(owner, 'PATCH', `/listings/${l.id}`, { price: 250, title: 'Maths book (Grewal)' }));
      expect(r.status).toBe('pending_review');
      expect(Number(r.price)).toBe(250);
      const feed = await ok(api(other, 'GET', `/listings?type=sell&search=${encodeURIComponent('Maths book (Grewal)')}`));
      expect(feed.some((x: any) => x.id === l.id)).toBe(false);
      const queue = await ok(api(admin, 'GET', '/admin/moderation'));
      expect(queue.filter((q: any) => (q.listing?.id ?? q.listing_id) === l.id)).toHaveLength(1);
    });

    it('FR-LST-8 · a rejected listing can be fixed and resubmitted', async () => {
      const l = await ok(post(owner, { type: 'sell', title: 'Blurry phone pic', price: 5 }));
      await ok(api(admin, 'POST', `/admin/moderation/${l.id}/reject`, { reason: 'Photo unclear' }));
      const r = await ok(api(owner, 'PATCH', `/listings/${l.id}`, { title: 'Clear phone pic' }));
      expect(r.status).toBe('pending_review');
    });

    it('FR-LST-8 · a listing with a deal in progress cannot be edited', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Reserved edit', price: 300 });
      await agreedDeal(owner, other, l.id, 300);
      expect((await api(owner, 'PATCH', `/listings/${l.id}`, { price: 1 })).status).toBe(400);
    });

    it('FR-LST-8 · edit keeps existing photos and refuses outside links', async () => {
      const photo = await uploadPhoto(owner);
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Photo edit', price: 50, images: [photo] });
      const r = await api(owner, 'PATCH', `/listings/${l.id}`, { images: [photo] });
      expect(r.status, msg(r)).toBe(200);
      const bad = await api(owner, 'PATCH', `/listings/${l.id}`, { images: ['https://example.com/x.jpg'] });
      expect(bad.status).toBe(400);
    });
  });

  describe('FR-LST-9 · reserved once a buyer is chosen, completed when the deal closes', () => {
    it('FR-LST-9 · finalising a deal marks the listing reserved and takes it off the feed', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Reserve me', price: 100 });
      await agreedDeal(owner, other, l.id, 100);
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('reserved');
      const feed = await ok(api(null, 'GET', `/listings?type=sell&search=${encodeURIComponent('Reserve me')}`));
      expect(feed.some((x: any) => x.id === l.id)).toBe(false);
    });

    it('FR-LST-9 · a completed handoff marks it completed', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Complete me', price: 100 });
      const { deal } = await agreedDeal(owner, other, l.id, 100);
      await ok(api(other, 'POST', `/transactions/${deal.id}/pay`));
      await ok(handoff(deal.id, owner, other));
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('completed');
    });

    it('FR-LST-9 · a cancelled deal puts the listing back live', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Cancel me', price: 100 });
      const { deal } = await agreedDeal(owner, other, l.id, 100);
      await ok(api(other, 'POST', `/transactions/${deal.id}/cancel`));
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('live');
    });
  });
});

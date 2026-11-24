import { api, liveListing, makeUser, msg, ok, sql, uploadPhoto, type TestUser } from './e2e/helpers.js';

/** SRS §3.2 Browsing and Search */
describe('FR-BRW · Browsing and search', () => {
  let admin: TestUser;
  let seller: TestUser;
  let viewer: TestUser;
  const tag = `brw${Date.now().toString(36)}`; // keeps this file's listings apart
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    admin = await makeUser('Admin', { admin: true });
    seller = await makeUser('Sita');
    viewer = await makeUser('Vikram');
    const photos = [await uploadPhoto(seller), await uploadPhoto(seller), await uploadPhoto(seller)];

    ids.calc = (await liveListing(seller, admin, {
      type: 'sell', title: `Casio calculator ${tag}`, category: 'Electronics', condition: 'Like New',
      price: 650, images: photos, description: `Barely used, with cover ${tag}`, meeting_location: 'Library',
    })).id;
    ids.lamp = (await liveListing(seller, admin, {
      type: 'lend', title: `Study lamp ${tag}`, category: 'Electronics', rent_amount: 30, rent_unit: 'day',
    })).id;
    ids.bat = (await liveListing(seller, admin, {
      type: 'exchange', title: `Cricket bat ${tag}`, category: 'Sports', want_tags: ['football'],
    })).id;
    ids.book = (await liveListing(seller, admin, {
      type: 'sell', title: `Engineering maths ${tag}`, category: 'Books', price: 200,
    })).id;
    ids.pending = (await ok(api(seller, 'POST', '/listings', {
      type: 'sell', title: `Not reviewed yet ${tag}`, category: 'Books', price: 50, meeting_location: 'Library',
    }))).id;
  });

  const feed = async (user: TestUser | null, query: string) =>
    (await ok(api(user, 'GET', `/listings?${query}&search=${tag}&limit=50`))) as any[];

  describe('FR-BRW-1 · feed of live listings, newest first, for guests and students', () => {
    it('FR-BRW-1 · a guest sees live listings', async () => {
      const rows = await feed(null, 'type=sell');
      expect(rows.map((l) => l.id)).toEqual(expect.arrayContaining([ids.calc, ids.book]));
    });

    it('FR-BRW-1 · only status live is shown (pending review is not)', async () => {
      const rows = await feed(null, 'type=sell');
      expect(rows.every((l) => l.status === 'live')).toBe(true);
      expect(rows.some((l) => l.id === ids.pending)).toBe(false);
    });

    it('FR-BRW-1 · newest first', async () => {
      const rows = await feed(viewer, 'type=sell');
      const times = rows.map((l) => new Date(l.created_at).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      expect(rows[0].id).toBe(ids.book);
    });

    it('FR-BRW-1 · a student does not see their own listings on Home (they are under My listings)', async () => {
      const rows = await feed(seller, 'type=sell');
      expect(rows).toHaveLength(0);
      const mine = await ok(api(seller, 'GET', '/listings/mine'));
      expect(mine.map((l: any) => l.id)).toEqual(expect.arrayContaining([ids.calc, ids.book]));
    });
  });

  describe('FR-BRW-2 · filter by type and category', () => {
    it.each([
      ['sell', ['calc', 'book']],
      ['lend', ['lamp']],
      ['exchange', ['bat']],
    ])('FR-BRW-2 · type=%s shows only that type', async (type, expected) => {
      const rows = await feed(viewer, `type=${type}`);
      expect(rows.every((l) => l.type === type)).toBe(true);
      expect(rows.map((l) => l.id).sort()).toEqual(expected.map((k) => ids[k]).sort());
    });

    it('FR-BRW-2 · category filter', async () => {
      const rows = await feed(viewer, 'type=sell&category=Books');
      expect(rows.map((l) => l.id)).toEqual([ids.book]);
    });

    it('FR-BRW-2 · an unknown type is refused', async () => {
      const r = await api(null, 'GET', '/listings?type=rent');
      expect(r.status).toBe(400);
    });
  });

  describe('FR-BRW-3 · keyword search, case-insensitive, over title and description', () => {
    it('FR-BRW-3 · matches the title, ignoring case', async () => {
      const rows = await ok(api(viewer, 'GET', `/listings?type=sell&search=${encodeURIComponent('CALCULATOR ' + tag.toUpperCase())}`));
      expect(rows.map((l: any) => l.id)).toEqual([ids.calc]);
    });

    it('FR-BRW-3 · matches the description', async () => {
      const rows = await ok(api(viewer, 'GET', `/listings?type=sell&search=${encodeURIComponent('with cover ' + tag)}`));
      expect(rows.map((l: any) => l.id)).toEqual([ids.calc]);
    });

    it.each(['Casio, (new)', 'a),status.eq.removed', "o'brien", '%%', '*', 'x.or.(id.eq.1)'])(
      'FR-BRW-3 · special characters in "%s" cannot break or change the query',
      async (q) => {
        const r = await api(null, 'GET', `/listings?type=sell&search=${encodeURIComponent(q)}`);
        expect(r.status, msg(r)).toBe(200);
        expect(r.body.every((l: any) => l.status === 'live')).toBe(true);
      },
    );
  });

  describe('FR-BRW-4 · listing detail', () => {
    it('FR-BRW-4 · shows photos, title, description, category, condition, price and meeting point', async () => {
      const l = await ok(api(viewer, 'GET', `/listings/${ids.calc}`));
      expect(l.images).toHaveLength(3);
      expect(l).toMatchObject({
        title: `Casio calculator ${tag}`, category: 'Electronics', condition: 'Like New',
        meeting_location: 'Library', type: 'sell',
      });
      expect(Number(l.price)).toBe(650);
      expect(l.description).toContain('Barely used');
    });

    it('FR-BRW-4 · lend listings show rent terms', async () => {
      const l = await ok(api(viewer, 'GET', `/listings/${ids.lamp}`));
      expect(Number(l.rent_amount)).toBe(30);
      expect(l.rent_unit).toBe('day');
    });

    it('FR-BRW-4 · exchange listings show the wanted items', async () => {
      const l = await ok(api(viewer, 'GET', `/listings/${ids.bat}`));
      expect(l.want_tags).toEqual(['football']);
    });

    it('FR-BRW-4 · a listing that is not live is hidden from others', async () => {
      expect((await api(viewer, 'GET', `/listings/${ids.pending}`)).status).toBe(404);
      expect((await api(seller, 'GET', `/listings/${ids.pending}`)).status).toBe(200);
    });
  });

  describe('FR-BRW-5 · guests do not get the meeting location', () => {
    it('FR-BRW-5 · feed rows for a guest have meeting_location null and location_hidden', async () => {
      const rows = await feed(null, 'type=sell');
      expect(rows.length).toBeGreaterThan(0);
      for (const l of rows) {
        expect(l.meeting_location).toBeNull();
        expect(l.location_hidden).toBe(true);
      }
    });

    it('FR-BRW-5 · listing detail for a guest hides it too', async () => {
      const l = await ok(api(null, 'GET', `/listings/${ids.calc}`));
      expect(l.meeting_location).toBeNull();
      expect(l.location_hidden).toBe(true);
    });

    it('FR-BRW-5 · an invalid or expired session is treated as a guest', async () => {
      const l = await ok(api(null, 'GET', `/listings/${ids.calc}`, undefined, { token: 'not-a-real-token' }));
      expect(l.meeting_location).toBeNull();
    });

    it('FR-BRW-5 · a signed-in student sees it', async () => {
      const l = await ok(api(viewer, 'GET', `/listings/${ids.calc}`));
      expect(l.meeting_location).toBe('Library');
      expect(l.location_hidden).toBeUndefined();
    });
  });

  describe('FR-BRW-6 · guests must sign in for anything but browsing (server side)', () => {
    it.each([
      ['POST', '/chats', { listing_id: '00000000-0000-0000-0000-000000000000' }],
      ['POST', '/listings', { type: 'sell', title: 'Guest item', category: 'Books', price: 1 }],
      ['POST', '/chats/00000000-0000-0000-0000-000000000000/offers', { offered_price: 10 }],
      ['GET', '/listings/mine', undefined],
    ])('FR-BRW-6 · guest %s %s → 401', async (method, path, body) => {
      expect((await api(null, method, path, body)).status).toBe(401);
    });
  });

  describe('FR-BRW-7 · paged feed', () => {
    beforeAll(async () => {
      for (let i = 0; i < 25; i++) {
        await sql(
          `insert into listings (owner_id, type, title, category, price, status, created_at)
           values ($1, 'sell', $2, 'Filler', $3::int, 'live', now() - make_interval(mins => $3::int))`,
          [seller.id, `Filler ${i} ${tag}`, i + 1],
        );
      }
    });

    it('FR-BRW-7 · 20 listings per page by default', async () => {
      const r = await ok(api(viewer, 'GET', `/listings?type=sell&category=Filler&search=${tag}`));
      expect(r).toHaveLength(20);
    });

    it('FR-BRW-7 · the next page continues without overlap', async () => {
      const p1 = await ok(api(viewer, 'GET', `/listings?type=sell&category=Filler&search=${tag}`));
      const p2 = await ok(api(viewer, 'GET', `/listings?type=sell&category=Filler&search=${tag}&offset=20`));
      expect(p2).toHaveLength(5);
      const first = new Set(p1.map((l: any) => l.id));
      expect(p2.some((l: any) => first.has(l.id))).toBe(false);
    });

    it('FR-BRW-7 · a page is never larger than 50, even if asked for more', async () => {
      const r = await api(viewer, 'GET', `/listings?type=sell&limit=500`);
      expect(r.status === 400 || (r.status === 200 && r.body.length <= 50)).toBe(true);
    });
  });

  describe('FR-BRW-8 · nearest to my hostel', () => {
    const near: Record<string, string> = {};
    let me: TestUser;

    beforeAll(async () => {
      me = await makeUser('Nikhil');
      await ok(api(me, 'PATCH', '/profile', { hostel: 'Agira Hall' }));
      for (const where of ['Sports Complex', 'Library', 'Hostel FRF', 'Amritam Hall', 'Agira Hall']) {
        near[where] = (await liveListing(seller, admin, {
          type: 'sell', title: `Near ${where} ${tag}`, category: 'NearTest', price: 10, meeting_location: where,
        })).id;
      }
    });

    const nearest = (user: TestUser | null, extra = '') =>
      ok(api(user, 'GET', `/listings?type=sell&category=NearTest&sort=nearest&search=${tag}${extra}`));

    it('FR-BRW-8 · sorted by distance from my hostel; places with no position last', async () => {
      const rows = await nearest(me);
      expect(rows.map((l: any) => l.meeting_location)).toEqual([
        'Agira Hall', 'Amritam Hall', 'Library', 'Hostel FRF', 'Sports Complex',
      ]);
    });

    it('FR-BRW-8 · each listing carries its distance (own hostel 0 m, Library ≈ 280 m, unknown null)', async () => {
      const rows = await nearest(me);
      const d = Object.fromEntries(rows.map((l: any) => [l.meeting_location, l.distance_m]));
      expect(d['Agira Hall']).toBe(0);
      expect(Math.abs(d['Library'] - 280)).toBeLessThanOrEqual(10);
      expect(d['Sports Complex']).toBeNull();
    });

    it('FR-BRW-8 · nearest-first pages line up with the full list', async () => {
      const all = await nearest(me);
      const p1 = await nearest(me, '&limit=2');
      const p2 = await nearest(me, '&limit=2&offset=2');
      const p3 = await nearest(me, '&limit=2&offset=4');
      expect([...p1, ...p2, ...p3].map((l: any) => l.id)).toEqual(all.map((l: any) => l.id));
    });

    it('FR-BRW-8 · a guest, or a student with no hostel, gets newest first', async () => {
      const newestFirst = [near['Agira Hall'], near['Amritam Hall'], near['Hostel FRF']];
      expect((await nearest(null)).slice(0, 3).map((l: any) => l.id)).toEqual(newestFirst);
      expect((await nearest(viewer)).slice(0, 3).map((l: any) => l.id)).toEqual(newestFirst);
    });

    it('FR-BRW-8 · no GPS: only a real hostel name can be saved', async () => {
      expect((await api(me, 'PATCH', '/profile', { hostel: 'Hostel Z' })).status).toBe(400);
      expect((await api(me, 'PATCH', '/profile', { hostel: 'Library' })).status).toBe(400);
    });

    it('FR-BRW-8 · the campus list has the 18 hostels and the meeting spots', async () => {
      const places = await ok(api(null, 'GET', '/campus/locations'));
      expect(places.filter((p: any) => p.kind === 'hostel')).toHaveLength(18);
      expect(places.some((p: any) => p.kind === 'spot' && p.name === 'Library')).toBe(true);
    });
  });
});

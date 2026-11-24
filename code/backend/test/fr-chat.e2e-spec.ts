import { api, fileForm, liveListing, makeUser, msg, ok, sql, sqlValue, uploadPhoto, type TestUser } from './e2e/helpers.js';

/** SRS §3.5 Chat and Negotiation */
describe('FR-CHT · Chat and negotiation', () => {
  let admin: TestUser;
  let owner: TestUser;
  let buyer: TestUser;
  let outsider: TestUser;
  let listing: any;
  let chat: any;

  beforeAll(async () => {
    admin = await makeUser('Admin', { admin: true });
    owner = await makeUser('Owner');
    buyer = await makeUser('Buyer');
    outsider = await makeUser('Outsider');
    listing = await liveListing(owner, admin, { type: 'sell', title: 'Chat calculator', category: 'Electronics', price: 600 });
    chat = await ok(api(buyer, 'POST', '/chats', { listing_id: listing.id }));
  });

  describe('FR-CHT-1 · one thread per buyer per listing', () => {
    it('FR-CHT-1 · a signed-in student starts a chat on a live listing', () => {
      expect(chat).toMatchObject({ listing_id: listing.id, initiator_id: buyer.id, owner_id: owner.id });
    });

    it('FR-CHT-1 · starting again returns the same thread', async () => {
      const again = await ok(api(buyer, 'POST', '/chats', { listing_id: listing.id }));
      expect(again.id).toBe(chat.id);
      expect(await sqlValue(`select count(*)::int from chats where listing_id = $1 and initiator_id = $2`, [listing.id, buyer.id])).toBe(1);
    });

    it('FR-CHT-1 · a listing that is not live cannot get a new chat', async () => {
      const pending = await ok(api(owner, 'POST', '/listings', {
        type: 'sell', title: 'Not live', category: 'Books', price: 5, meeting_location: 'Library',
      }));
      expect((await api(buyer, 'POST', '/chats', { listing_id: pending.id })).status).toBe(400);
    });

    it('FR-CHT-1 · a student whose ID is not verified cannot start a chat', async () => {
      const pending = await makeUser('Unverified', { verified: false });
      expect((await api(pending, 'POST', '/chats', { listing_id: listing.id })).status).toBe(403);
    });
  });

  describe('FR-CHT-2 · no chat on your own listing', () => {
    it('FR-CHT-2 · the owner is refused', async () => {
      const r = await api(owner, 'POST', '/chats', { listing_id: listing.id });
      expect(r.status).toBe(400);
      expect(msg(r)).toMatch(/own listing/);
    });
  });

  describe('FR-CHT-3 · messages in time order (latest 200)', () => {
    it('FR-CHT-3 · both participants send and read messages, oldest first', async () => {
      await ok(api(buyer, 'POST', `/chats/${chat.id}/messages`, { content: 'Is it still available?' }));
      await ok(api(owner, 'POST', `/chats/${chat.id}/messages`, { content: 'Yes it is.' }));
      const msgs = await ok(api(owner, 'GET', `/chats/${chat.id}/messages`));
      expect(msgs.slice(-2).map((m: any) => [m.sender_id, m.content])).toEqual([
        [buyer.id, 'Is it still available?'],
        [owner.id, 'Yes it is.'],
      ]);
    });

    it('FR-CHT-3 · an empty message or one over 2000 characters is refused', async () => {
      expect((await api(buyer, 'POST', `/chats/${chat.id}/messages`, { content: '' })).status).toBe(400);
      expect((await api(buyer, 'POST', `/chats/${chat.id}/messages`, { content: 'x'.repeat(2001) })).status).toBe(400);
    });

    it('FR-CHT-3 · a long chat returns the LATEST 200 messages, in time order', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Long chat', price: 10 });
      const c = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      await sql(
        `insert into messages (chat_id, sender_id, content, sent_at)
         select $1, $2, 'message ' || i, now() - make_interval(secs => 300 - i) from generate_series(1, 250) as i`,
        [c.id, buyer.id],
      );
      const msgs = await ok(api(buyer, 'GET', `/chats/${c.id}/messages`));
      expect(msgs).toHaveLength(200);
      expect(msgs[0].content).toBe('message 51');
      expect(msgs[199].content).toBe('message 250');
    });
  });

  describe('FR-CHT-4 · my chat threads', () => {
    it('FR-CHT-4 · each thread comes with its listing and last message', async () => {
      const threads = await ok(api(buyer, 'GET', '/chats'));
      const t = threads.find((x: any) => x.id === chat.id);
      expect(t.listing).toMatchObject({ id: listing.id, title: 'Chat calculator' });
      expect(t.last_message.content).toBe('Yes it is.');
    });

    it('FR-CHT-4 · the owner sees the thread too; an outsider does not', async () => {
      expect((await ok(api(owner, 'GET', '/chats'))).some((x: any) => x.id === chat.id)).toBe(true);
      expect((await ok(api(outsider, 'GET', '/chats'))).some((x: any) => x.id === chat.id)).toBe(false);
    });
  });

  describe('FR-CHT-5 · non-participants are forbidden', () => {
    it.each([
      ['GET', 'messages', undefined],
      ['POST', 'messages', { content: 'Let me in' }],
      ['GET', 'offers', undefined],
      ['POST', 'offers', { offered_price: 1 }],
    ])('FR-CHT-5 · %s /chats/:id/%s by an outsider → 403', async (method, what, body) => {
      expect((await api(outsider, method, `/chats/${chat.id}/${what}`, body)).status).toBe(403);
    });

    it('FR-CHT-5 · an outsider cannot accept or reject an offer', async () => {
      const offer = await ok(api(buyer, 'POST', `/chats/${chat.id}/offers`, { offered_price: 500 }));
      expect((await api(outsider, 'POST', `/chats/offers/${offer.id}/accept`)).status).toBe(403);
      expect((await api(outsider, 'POST', `/chats/offers/${offer.id}/reject`)).status).toBe(403);
      await ok(api(owner, 'POST', `/chats/offers/${offer.id}/reject`));
    });
  });

  describe('FR-CHT-6 · either side offers; only the other side decides', () => {
    it('FR-CHT-6 · you cannot accept your own offer', async () => {
      const offer = await ok(api(buyer, 'POST', `/chats/${chat.id}/offers`, { offered_price: 520 }));
      expect((await api(buyer, 'POST', `/chats/offers/${offer.id}/accept`)).status).toBe(400);
      await ok(api(owner, 'POST', `/chats/offers/${offer.id}/reject`));
    });

    it('FR-CHT-6 · the owner can counter, and the buyer accepts', async () => {
      const counter = await ok(api(owner, 'POST', `/chats/${chat.id}/offers`, { offered_price: 580 }));
      expect(counter.sender_id).toBe(owner.id);
      const r = await ok(api(buyer, 'POST', `/chats/offers/${counter.id}/accept`));
      expect(r.status).toBe('accepted');
    });

    it('FR-CHT-6 · a decided offer cannot be decided again', async () => {
      const accepted = await sqlValue(`select id from offers where chat_id = $1 and status = 'accepted'`, [chat.id]);
      expect((await api(buyer, 'POST', `/chats/offers/${accepted}/reject`)).status).toBe(400);
    });
  });

  describe('FR-CHT-7 · accepting closes the negotiation', () => {
    it('FR-CHT-7 · accepting rejects every other pending offer in the thread', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Pending offers', price: 300 });
      const c = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      const a = await ok(api(buyer, 'POST', `/chats/${c.id}/offers`, { offered_price: 250 }));
      const b = await ok(api(owner, 'POST', `/chats/${c.id}/offers`, { offered_price: 290 }));
      await ok(api(owner, 'POST', `/chats/offers/${a.id}/accept`));
      const rows = await sql(`select id, status from offers where chat_id = $1`, [c.id]);
      expect(Object.fromEntries(rows.map((o) => [o.id, o.status]))).toEqual({ [a.id]: 'accepted', [b.id]: 'rejected' });
    });

    it('FR-CHT-7 · no further offers after one is accepted (exactly one accepted per thread)', async () => {
      const r = await api(owner, 'POST', `/chats/${chat.id}/offers`, { offered_price: 700 });
      expect(r.status).toBe(400);
      expect(msg(r)).toMatch(/already been agreed/);
      expect(await sqlValue(`select count(*)::int from offers where chat_id = $1 and status = 'accepted'`, [chat.id])).toBe(1);
    });

    it('FR-CHT-7 · an offer must be a valid amount', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Bad amounts', price: 300 });
      const c = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      expect((await api(buyer, 'POST', `/chats/${c.id}/offers`, { offered_price: -1 })).status).toBe(400);
      expect((await api(buyer, 'POST', `/chats/${c.id}/offers`, { offered_price: 'lots' })).status).toBe(400);
    });
  });

  describe('FR-CHT-8 · one timeline of messages and offers (app)', () => {
    it('FR-CHT-8 · messages and offers both carry timestamps the app merges into one timeline', async () => {
      const msgs = await ok(api(buyer, 'GET', `/chats/${chat.id}/messages`));
      const offers = await ok(api(buyer, 'GET', `/chats/${chat.id}/offers`));
      expect(msgs.every((m: any) => !Number.isNaN(Date.parse(m.sent_at)))).toBe(true);
      expect(offers.every((o: any) => !Number.isNaN(Date.parse(o.created_at)))).toBe(true);
    });
  });

  describe('FR-CHT-9 · the owner picks one buyer among several and finalises', () => {
    it('FR-CHT-9 · two buyers agree a price; the owner finalises with one, the other cannot follow', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Two buyers', price: 400 });
      const second = await makeUser('Second');
      const chats = [];
      for (const [who, price] of [[buyer, 380], [second, 400]] as const) {
        const c = await ok(api(who, 'POST', '/chats', { listing_id: l.id }));
        const o = await ok(api(who, 'POST', `/chats/${c.id}/offers`, { offered_price: price }));
        await ok(api(owner, 'POST', `/chats/offers/${o.id}/accept`));
        chats.push(c);
      }
      expect((await api(buyer, 'POST', '/transactions', { chat_id: chats[1].id })).status).toBe(403);
      const deal = await ok(api(owner, 'POST', '/transactions', { chat_id: chats[1].id }));
      expect(deal).toMatchObject({ buyer_id: second.id, seller_id: owner.id, status: 'pending_payment' });
      expect(Number(deal.agreed_price)).toBe(400);
      expect((await api(owner, 'POST', '/transactions', { chat_id: chats[0].id })).status).toBe(400);
    });

    it('FR-CHT-9 · finalising needs an accepted offer', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'No agreement', price: 400 });
      const c = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      expect((await api(owner, 'POST', '/transactions', { chat_id: c.id })).status).toBe(400);
    });
  });

  describe('FR-CHT-11 · both parties confirm a deal', () => {
    it('FR-CHT-11 · one side proposes terms and only the other side can accept them', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Confirm terms', price: 200 });
      const c = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      const o = await ok(api(buyer, 'POST', `/chats/${c.id}/offers`, { offered_price: 180 }));
      expect((await api(buyer, 'POST', `/chats/offers/${o.id}/accept`)).status).toBe(400);
      expect((await ok(api(owner, 'POST', `/chats/offers/${o.id}/accept`))).status).toBe('accepted');
    });

    it('FR-CHT-11 · the deal is created only from accepted terms, at exactly that price', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Confirm price', price: 200 });
      const c = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      const o = await ok(api(owner, 'POST', `/chats/${c.id}/offers`, { offered_price: 190 }));
      expect((await api(owner, 'POST', '/transactions', { chat_id: c.id })).status).toBe(400);
      await ok(api(buyer, 'POST', `/chats/offers/${o.id}/accept`));
      const deal = await ok(api(owner, 'POST', '/transactions', { chat_id: c.id }));
      expect(Number(deal.agreed_price)).toBe(190);
    });

    it('FR-CHT-11 · the buyer confirms by paying, and the receiver confirms the handoff by scanning', async () => {
      const l = await liveListing(owner, admin, { type: 'sell', title: 'Confirm both', price: 100 });
      const c = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      const o = await ok(api(buyer, 'POST', `/chats/${c.id}/offers`, { offered_price: 100 }));
      await ok(api(owner, 'POST', `/chats/offers/${o.id}/accept`));
      const deal = await ok(api(owner, 'POST', '/transactions', { chat_id: c.id }));
      expect(deal.status).toBe('pending_payment');
      expect((await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`))).status).toBe('escrow_held');
      await ok(api(owner, 'POST', `/transactions/${deal.id}/photos`, undefined, { form: fileForm({}, { stage: 'handoff' }) }));
      const qr = await ok(api(owner, 'POST', `/transactions/${deal.id}/qr`));
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/photos`, undefined, { form: fileForm({}, { stage: 'handoff' }) }));
      expect((await ok(api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: qr.payload }))).status).toBe('completed');
    });
  });

  describe('FR-CHT-10 · real-time delivery', () => {
    it.todo('FR-CHT-10 · messages arrive live through Supabase Realtime — checked on two phones (manual test MT-CHT-10)');
  });

  describe('Exchange negotiation (FR-CHT-6 for swaps)', () => {
    let bat: any;
    let swapChat: any;

    beforeAll(async () => {
      bat = await liveListing(owner, admin, { type: 'exchange', title: 'Cricket bat swap', category: 'Sports', want_tags: ['headphones'] });
      swapChat = await ok(api(buyer, 'POST', '/chats', { listing_id: bat.id }));
    });

    it('FR-CHT-6 · a plain price offer is refused on an exchange: name the item', async () => {
      const r = await api(buyer, 'POST', `/chats/${swapChat.id}/offers`, { offered_price: 0 });
      expect(r.status).toBe(400);
      expect(msg(r)).toMatch(/item/i);
    });

    it('FR-CHT-6 · an item offer needs a photo, and the photo must be the student’s own upload', async () => {
      expect((await api(buyer, 'POST', `/chats/${swapChat.id}/offers`, { offered_price: 0, item_title: 'Headphones' })).status).toBe(400);
      const theirs = await uploadPhoto(owner);
      const r = await api(buyer, 'POST', `/chats/${swapChat.id}/offers`, {
        offered_price: 0, item_title: 'Headphones', item_images: [theirs],
      });
      expect(r.status).toBe(400);
    });

    it('FR-CHT-6 · the owner cannot counter before an item is offered', async () => {
      expect((await api(owner, 'POST', `/chats/${swapChat.id}/offers`, { offered_price: 100, topup_payer: 'owner' })).status).toBe(400);
    });

    it('FR-CHT-6 · a top-up must say who pays', async () => {
      const photo = await uploadPhoto(buyer);
      const r = await api(buyer, 'POST', `/chats/${swapChat.id}/offers`, { offered_price: 50, item_title: 'Headphones', item_images: [photo] });
      expect(r.status).toBe(400);
    });

    it('FR-CHT-6 · item offer saved; owner counter keeps the item and adds a top-up', async () => {
      const photo = await uploadPhoto(buyer);
      const o1 = await ok(api(buyer, 'POST', `/chats/${swapChat.id}/offers`, {
        offered_price: 0, item_title: 'Boat Rockerz headphones', item_description: '6 months old', item_images: [photo, photo],
      }));
      expect(o1).toMatchObject({ item_title: 'Boat Rockerz headphones', topup_payer: null });
      expect(o1.item_images).toHaveLength(2);
      await ok(api(owner, 'POST', `/chats/offers/${o1.id}/reject`));
      const o2 = await ok(api(owner, 'POST', `/chats/${swapChat.id}/offers`, { offered_price: 200, topup_payer: 'owner' }));
      expect(o2).toMatchObject({ item_title: 'Boat Rockerz headphones', topup_payer: 'owner' });
      expect(Number(o2.offered_price)).toBe(200);
    });
  });
});

import {
  agreedDeal, api, day, fileForm, handoff, liveListing, makeUser, msg, ok, sql, sqlValue, uploadPhoto, type TestUser,
} from './e2e/helpers.js';

/**
 * SRS §3.6 Payment and Escrow. The pilot has no payment gateway yet: "pay"
 * records the money as held in escrow, and release/refund are recorded the
 * same way. These tests check those rules; swapping in a real gateway only
 * changes pay(), settle() and refund() in transactions.service.ts.
 */
describe('FR-PAY · Payment and escrow', () => {
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

  const sellListing = (title: string, price = 600) =>
    liveListing(seller, admin, { type: 'sell', title, category: 'Electronics', price, meeting_location: 'Library' });

  describe('FR-PAY-1 · finalising creates the transaction', () => {
    it('FR-PAY-1 · records listing, type, buyer, seller, agreed price, meeting point; status pending_payment', async () => {
      const l = await sellListing('Pay-1 calculator');
      const { deal } = await agreedDeal(seller, buyer, l.id, 550);
      expect(deal).toMatchObject({
        listing_id: l.id, type: 'sell', buyer_id: buyer.id, seller_id: seller.id,
        meeting_location: 'Library', status: 'pending_payment',
      });
      expect(Number(deal.agreed_price)).toBe(550);
    });

    it('FR-PAY-1 · the meeting point can be changed at finalising, to a campus place only', async () => {
      const l = await sellListing('Pay-1 meeting point');
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      const o = await ok(api(buyer, 'POST', `/chats/${chat.id}/offers`, { offered_price: 600 }));
      await ok(api(seller, 'POST', `/chats/offers/${o.id}/accept`));
      expect((await api(seller, 'POST', '/transactions', { chat_id: chat.id, meeting_location: 'The Moon' })).status).toBe(400);
      const deal = await ok(api(seller, 'POST', '/transactions', { chat_id: chat.id, meeting_location: 'Main Gate' }));
      expect(deal.meeting_location).toBe('Main Gate');
    });

    it('FR-PAY-1 · only the listing owner can finalise', async () => {
      const l = await sellListing('Pay-1 owner only');
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      const o = await ok(api(buyer, 'POST', `/chats/${chat.id}/offers`, { offered_price: 600 }));
      await ok(api(seller, 'POST', `/chats/offers/${o.id}/accept`));
      expect((await api(buyer, 'POST', '/transactions', { chat_id: chat.id })).status).toBe(403);
    });
  });

  describe('FR-PAY-2 · buyer pays into escrow', () => {
    it('FR-PAY-2 · paying moves the deal to escrow_held and holds the full amount', async () => {
      const l = await sellListing('Pay-2 hold');
      const { deal } = await agreedDeal(seller, buyer, l.id, 600);
      const paid = await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      expect(paid.status).toBe('escrow_held');
      expect(paid.escrow).toMatchObject({ status: 'held' });
      expect(Number(paid.escrow.amount)).toBe(600);
    });

    it('FR-PAY-2 · the seller cannot pay, and nobody can pay twice', async () => {
      const l = await sellListing('Pay-2 rules');
      const { deal } = await agreedDeal(seller, buyer, l.id, 600);
      expect((await api(seller, 'POST', `/transactions/${deal.id}/pay`)).status).toBe(403);
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      expect((await api(buyer, 'POST', `/transactions/${deal.id}/pay`)).status).toBe(400);
      expect((await sql(`select count(*)::int as n from escrow_holds where transaction_id = $1`, [deal.id]))[0].n).toBe(1);
    });

    it('FR-PAY-8 · exchange top-up: the side named as payer pays it into escrow; it goes to the person who offered the item', async () => {
      const bat = await liveListing(seller, admin, { type: 'exchange', title: 'Pay-2 swap', category: 'Sports', want_tags: ['headphones'] });
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: bat.id }));
      const photo = await uploadPhoto(buyer);
      const o1 = await ok(api(buyer, 'POST', `/chats/${chat.id}/offers`, { offered_price: 0, item_title: 'Headphones', item_images: [photo] }));
      await ok(api(seller, 'POST', `/chats/offers/${o1.id}/reject`));
      const o2 = await ok(api(seller, 'POST', `/chats/${chat.id}/offers`, { offered_price: 200, topup_payer: 'owner' }));
      await ok(api(buyer, 'POST', `/chats/offers/${o2.id}/accept`));
      const deal = await ok(api(seller, 'POST', '/transactions', { chat_id: chat.id }));
      expect(deal.payer_id).toBe(seller.id);
      expect(deal.exchange_item).toMatchObject({ title: 'Headphones' });
      expect((await api(buyer, 'POST', `/transactions/${deal.id}/pay`)).status).toBe(403);
      const paid = await ok(api(seller, 'POST', `/transactions/${deal.id}/pay`));
      expect(Number(paid.escrow.amount)).toBe(200);
      const done = await ok(handoff(deal.id, seller, buyer));
      expect(done.status).toBe('completed');
      // The top-up goes to the person who offered the item (the buyer side here).
      expect(Number(done.escrow.refunded_to_buyer)).toBe(200);
      expect(Number(done.escrow.released_to_seller)).toBe(0);
    });

    it('FR-PAY-8 · a straight swap (no money) holds ₹0 and goes straight to the meetup', async () => {
      const notes = await liveListing(seller, admin, { type: 'exchange', title: 'Pay-2 straight swap', category: 'Books', want_tags: ['notes'] });
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: notes.id }));
      const photo = await uploadPhoto(buyer);
      const o = await ok(api(buyer, 'POST', `/chats/${chat.id}/offers`, { offered_price: 0, item_title: 'Chem notes', item_images: [photo] }));
      await ok(api(seller, 'POST', `/chats/offers/${o.id}/accept`));
      const deal = await ok(api(seller, 'POST', '/transactions', { chat_id: chat.id }));
      expect(deal.status).toBe('escrow_held');
      expect(Number(deal.escrow.amount)).toBe(0);
    });
  });

  describe('FR-PAY-3 · lend terms: dates, deposit, rent', () => {
    let lamp: any;
    beforeAll(async () => {
      lamp = await liveListing(seller, admin, { type: 'lend', title: 'Pay-3 lamp', category: 'Electronics', rent_amount: 40, rent_unit: 'day' });
    });

    it('FR-PAY-3 · start and end date, deposit and rent per day are recorded; rent = ₹40 × 7 days', async () => {
      const { deal } = await agreedDeal(seller, buyer, lamp.id, 40, { start_date: day(0), end_date: day(7), deposit_amount: 500 });
      expect(Number(deal.agreed_price)).toBe(280);
      expect(deal.lend_rate).toEqual({ amount: 40, unit: 'day' });
      const [row] = await sql(`select start_date, end_date, deposit_amount, rent_per_day from lend_details where transaction_id = $1`, [deal.id]);
      expect(Number(row.deposit_amount)).toBe(500);
      expect(Number(row.rent_per_day)).toBe(40);
      const paid = await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      expect(Number(paid.escrow.amount)).toBe(780); // rent + deposit
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/cancel`));
    });

    it('FR-PAY-3 · weekly rate counts started weeks (10 days = 2 weeks)', async () => {
      const cycle = await liveListing(seller, admin, { type: 'lend', title: 'Pay-3 cycle', category: 'Cycles', rent_amount: 100, rent_unit: 'week' });
      const { deal } = await agreedDeal(seller, buyer, cycle.id, 100, { start_date: day(0), end_date: day(9), deposit_amount: 0 });
      expect(Number(deal.agreed_price)).toBe(200);
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/cancel`));
    });

    it('FR-PAY-3 · dates are required, cannot start in the past, and must end on/after the start', async () => {
      const l = await liveListing(seller, admin, { type: 'lend', title: 'Pay-3 dates', category: 'Electronics', rent_amount: 10, rent_unit: 'day' });
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: l.id }));
      const o = await ok(api(buyer, 'POST', `/chats/${chat.id}/offers`, { offered_price: 10 }));
      await ok(api(seller, 'POST', `/chats/offers/${o.id}/accept`));
      for (const dates of [{}, { start_date: day(-3), end_date: day(2) }, { start_date: day(3), end_date: day(1) }]) {
        const r = await api(seller, 'POST', '/transactions', { chat_id: chat.id, deposit_amount: 0, ...dates });
        expect(r.status, JSON.stringify(dates)).toBe(400);
      }
    });
  });

  describe('FR-PAY-4 · escrow is released only after the handoff', () => {
    it('FR-PAY-4 · still held after the QR is shown; released to the seller on the scan', async () => {
      const l = await sellListing('Pay-4 release', 600);
      const { deal } = await agreedDeal(seller, buyer, l.id, 600);
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      const before = await sql(`select status from escrow_holds where transaction_id = $1`, [deal.id]);
      expect(before[0].status).toBe('held');
      const done = await ok(handoff(deal.id, seller, buyer));
      expect(done.escrow.status).toBe('released');
      expect(Number(done.escrow.released_to_seller)).toBe(600);
    });

    it('FR-PAY-4 · for a lend, rent is released only after the return (see FR-LND-4)', async () => {
      const l = await liveListing(seller, admin, { type: 'lend', title: 'Pay-4 lend', category: 'Electronics', rent_amount: 20, rent_unit: 'day' });
      const { deal } = await agreedDeal(seller, buyer, l.id, 20, { start_date: day(0), end_date: day(1), deposit_amount: 100 });
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      const inUse = await ok(handoff(deal.id, seller, buyer));
      expect(inUse.status).toBe('in_use');
      expect(inUse.escrow.status).toBe('held');
    });
  });

  describe('FR-PAY-5 · refund when cancelled before handoff', () => {
    it('FR-PAY-5 · cancelling a paid deal refunds the buyer in full', async () => {
      const l = await sellListing('Pay-5 refund', 4000);
      const { deal } = await agreedDeal(seller, buyer, l.id, 4000);
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      const r = await ok(api(seller, 'POST', `/transactions/${deal.id}/cancel`));
      expect(r.status).toBe('refunded');
      expect(Number(r.escrow.refunded_to_buyer)).toBe(4000);
    });

    it('FR-PAY-5 · cancelling before payment just cancels', async () => {
      const l = await sellListing('Pay-5 cancel');
      const { deal } = await agreedDeal(seller, buyer, l.id, 600);
      expect((await ok(api(buyer, 'POST', `/transactions/${deal.id}/cancel`))).status).toBe('cancelled');
    });

    it('FR-PAY-5 · a completed deal cannot be cancelled', async () => {
      const l = await sellListing('Pay-5 completed');
      const { deal } = await agreedDeal(seller, buyer, l.id, 600);
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      await ok(handoff(deal.id, seller, buyer));
      expect((await api(buyer, 'POST', `/transactions/${deal.id}/cancel`)).status).toBe(400);
    });

    it.todo('FR-PAY-5 · refund after a dispute decided for the buyer — covered in FR-DSP-4');
  });

  describe('FR-PAY-6 · both parties see the status', () => {
    let deal: any;
    beforeAll(async () => {
      const l = await sellListing('Pay-6 status');
      deal = (await agreedDeal(seller, buyer, l.id, 600)).deal;
    });

    it('FR-PAY-6 · buyer and seller both read the deal with its status and their role', async () => {
      const b = await ok(api(buyer, 'GET', `/transactions/${deal.id}`));
      const s = await ok(api(seller, 'GET', `/transactions/${deal.id}`));
      expect([b.status, b.my_role]).toEqual(['pending_payment', 'buyer']);
      expect([s.status, s.my_role]).toEqual(['pending_payment', 'seller']);
    });

    it('FR-PAY-6 · the deal appears in both people’s deal lists', async () => {
      for (const u of [buyer, seller]) {
        const list = await ok(api(u, 'GET', '/transactions'));
        expect((list.items ?? list).some((d: any) => d.id === deal.id)).toBe(true);
      }
    });

    it('FR-PAY-6 · someone else cannot see it', async () => {
      const r = await api(outsider, 'GET', `/transactions/${deal.id}`);
      expect([403, 404]).toContain(r.status);
      expect(msg(r)).not.toContain(buyer.email);
    });
  });
  describe('FR-PAY-7 · who can cancel, and when', () => {
    it('FR-PAY-7 · the buyer or the seller can cancel before the handoff', async () => {
      for (const who of ['buyer', 'seller'] as const) {
        const l = await sellListing(`Pay-7 ${who} cancels`);
        const { deal } = await agreedDeal(seller, buyer, l.id, 600);
        const r = await ok(api(who === 'buyer' ? buyer : seller, 'POST', `/transactions/${deal.id}/cancel`));
        expect(r.status).toBe('cancelled');
      }
    });

    it('FR-PAY-7 · after cancelling, the listing is live again and the QR code stops working', async () => {
      const l = await sellListing('Pay-7 relist');
      const { deal } = await agreedDeal(seller, buyer, l.id, 600);
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      await ok(api(seller, 'POST', `/transactions/${deal.id}/photos`, undefined, { form: fileForm({}, { stage: 'handoff' }) }));
      const qr = await ok(api(seller, 'POST', `/transactions/${deal.id}/qr`));
      await ok(api(seller, 'POST', `/transactions/${deal.id}/cancel`));
      expect(await sqlValue(`select status from listings where id = $1`, [l.id])).toBe('live');
      expect(await sqlValue(`select count(*)::int from qr_tokens where transaction_id = $1 and expires_at > now() and not used`, [deal.id])).toBe(0);
      expect((await api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: qr.payload })).status).toBe(400);
    });

    it('FR-PAY-7 · nobody else can cancel, and a deal cannot be cancelled once the item has changed hands', async () => {
      const outsider2 = await makeUser('Outsider2');
      const l = await liveListing(seller, admin, { type: 'lend', title: 'Pay-7 in use', category: 'Electronics', rent_amount: 10, rent_unit: 'day' });
      const { deal } = await agreedDeal(seller, buyer, l.id, 10, { start_date: day(0), end_date: day(2), deposit_amount: 0 });
      expect([403, 404]).toContain((await api(outsider2, 'POST', `/transactions/${deal.id}/cancel`)).status);
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      await ok(handoff(deal.id, seller, buyer));
      const r = await api(buyer, 'POST', `/transactions/${deal.id}/cancel`);
      expect(r.status).toBe(400);
      expect(msg(r)).toMatch(/before the handoff/);
    });
  });

  describe('FR-PAY-8 · exchange escrow', () => {
    it('FR-PAY-8 · when the person offering the item adds the top-up, the owner receives it on the scan', async () => {
      const bat = await liveListing(seller, admin, { type: 'exchange', title: 'Pay-8 initiator pays', category: 'Sports', want_tags: ['ball'] });
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: bat.id }));
      const photo = await uploadPhoto(buyer);
      const o = await ok(api(buyer, 'POST', `/chats/${chat.id}/offers`, {
        offered_price: 150, topup_payer: 'initiator', item_title: 'Football', item_images: [photo],
      }));
      await ok(api(seller, 'POST', `/chats/offers/${o.id}/accept`));
      const deal = await ok(api(seller, 'POST', '/transactions', { chat_id: chat.id }));
      expect(deal.payer_id).toBe(buyer.id);
      expect((await api(seller, 'POST', `/transactions/${deal.id}/pay`)).status).toBe(403);
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
      const done = await ok(handoff(deal.id, seller, buyer));
      expect(Number(done.escrow.released_to_seller)).toBe(150);
    });

    it('FR-PAY-8 · a cancelled swap returns the top-up to whoever paid it', async () => {
      const bat = await liveListing(seller, admin, { type: 'exchange', title: 'Pay-8 refund top-up', category: 'Sports', want_tags: ['ball'] });
      const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: bat.id }));
      const photo = await uploadPhoto(buyer);
      const o1 = await ok(api(buyer, 'POST', `/chats/${chat.id}/offers`, { offered_price: 0, item_title: 'Football', item_images: [photo] }));
      await ok(api(seller, 'POST', `/chats/offers/${o1.id}/reject`));
      const o2 = await ok(api(seller, 'POST', `/chats/${chat.id}/offers`, { offered_price: 120, topup_payer: 'owner' }));
      await ok(api(buyer, 'POST', `/chats/offers/${o2.id}/accept`));
      const deal = await ok(api(seller, 'POST', '/transactions', { chat_id: chat.id }));
      await ok(api(seller, 'POST', `/transactions/${deal.id}/pay`));
      const r = await ok(api(buyer, 'POST', `/transactions/${deal.id}/cancel`));
      expect(r.status).toBe('refunded');
      expect(r.escrow.status).toBe('refunded');
      expect(Number(r.escrow.released_to_seller)).toBe(120); // back to the owner, who paid it
    });
  });
});

import {
  agreedDeal, api, day, fileForm, handoff, inbox, liveListing, makeUser, msg, ok, paidSellDeal, sql, sqlValue, type TestUser,
} from './e2e/helpers.js';

const photo = (stage: 'handoff' | 'return' = 'handoff') => ({ form: fileForm({}, { stage }) });

/** SRS §3.7 QR-Verified Handoff */
describe('FR-HND · QR-verified handoff', () => {
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

  describe('FR-HND-1 · a single-use, time-bound QR after payment', () => {
    it('FR-HND-1 · no QR before payment', async () => {
      const l = await liveListing(seller, admin, { type: 'sell', title: 'Unpaid QR', price: 100 });
      const { deal } = await agreedDeal(seller, buyer, l.id, 100);
      expect((await api(seller, 'POST', `/transactions/${deal.id}/qr`)).status).toBe(400);
    });

    it('FR-HND-1 · the seller (giver) gets a code bound to this deal, expiring in 10 minutes; status qr_issued', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin);
      await ok(api(seller, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
      const qr = await ok(api(seller, 'POST', `/transactions/${deal.id}/qr`));
      expect(qr.payload).toBe(`CX:${deal.id}:${qr.code}`);
      expect(qr.code).toMatch(/^[A-Z0-9]{8}$/);
      const minutes = (Date.parse(qr.expires_at) - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(9);
      expect(minutes).toBeLessThanOrEqual(10.1);
      expect(await sqlValue(`select status from transactions where id = $1`, [deal.id])).toBe('qr_issued');
    });

    it('FR-HND-1 · the buyer (receiver) cannot show the QR', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin);
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
      expect((await api(buyer, 'POST', `/transactions/${deal.id}/qr`)).status).toBe(403);
    });

    it('FR-HND-1 · a new code replaces the old one (only one live code)', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin);
      await ok(api(seller, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
      const first = await ok(api(seller, 'POST', `/transactions/${deal.id}/qr`));
      const second = await ok(api(seller, 'POST', `/transactions/${deal.id}/qr`));
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
      expect((await api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: first.payload })).status).toBe(400);
      expect((await ok(api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: second.payload }))).status).toBe('completed');
    });
  });

  describe('FR-HND-2 · the scan is accepted only if valid, unexpired, unused and for this deal', () => {
    let deal: any;
    let qr: any;

    beforeEach(async () => {
      ({ deal } = await paidSellDeal(seller, buyer, admin));
      await ok(api(seller, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
      qr = await ok(api(seller, 'POST', `/transactions/${deal.id}/qr`));
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
    });

    it('FR-HND-2 · a wrong code is refused', async () => {
      expect((await api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: 'ZZZZZZZZ' })).status).toBe(400);
    });

    it('FR-HND-2 · an expired code is refused', async () => {
      await sql(`update qr_tokens set expires_at = now() - interval '1 minute' where transaction_id = $1`, [deal.id]);
      const r = await api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: qr.payload });
      expect(r.status).toBe(400);
      expect(msg(r)).toMatch(/expired/i);
    });

    it('FR-HND-2 · a QR from a different deal is refused', async () => {
      const other = await paidSellDeal(seller, buyer, admin);
      const r = await api(buyer, 'POST', `/transactions/${other.deal.id}/scan`, { token: qr.payload });
      expect(r.status).toBe(400);
    });

    it('FR-HND-2 · the typed 8-character code works as well as the scanned QR', async () => {
      const r = await ok(api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: qr.code.toLowerCase() }));
      expect(r.status).toBe('completed');
    });

    it('FR-HND-2 · the seller cannot scan their own QR, and outsiders cannot scan at all', async () => {
      expect((await api(seller, 'POST', `/transactions/${deal.id}/scan`, { token: qr.payload })).status).toBe(403);
      expect((await api(outsider, 'POST', `/transactions/${deal.id}/scan`, { token: qr.payload })).status).toBe(403);
    });

    it('FR-HND-2 · a used code cannot be used again', async () => {
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: qr.payload }));
      expect((await api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: qr.payload })).status).toBe(400);
    });
  });

  describe('FR-HND-3 · condition photos at handoff', () => {
    it('FR-HND-3 · the QR stays locked until the giver photographs the item', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin);
      const r = await api(seller, 'POST', `/transactions/${deal.id}/qr`);
      expect(r.status).toBe(400);
      expect(msg(r)).toMatch(/photo/i);
    });

    it('FR-HND-3 · the scan is refused until the receiver adds their own photo', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin);
      await ok(api(seller, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
      const qr = await ok(api(seller, 'POST', `/transactions/${deal.id}/qr`));
      const before = await ok(api(buyer, 'GET', `/transactions/${deal.id}`));
      expect(before.photo_status).toMatchObject({ mine: false, theirs: true });
      const r = await api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: qr.payload });
      expect(r.status).toBe(400);
      expect(msg(r)).toMatch(/photo/i);
    });

    it('FR-HND-3 · photos are stored against the deal, by stage and uploader, shown through signed links', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin);
      const p = await ok(api(seller, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
      expect(p.url).toContain('/object/sign/condition-photos/');
      const rows = await sql(`select stage, uploaded_by, image_url from condition_photos where transaction_id = $1`, [deal.id]);
      expect(rows).toEqual([{ stage: 'handoff', uploaded_by: seller.id, image_url: expect.stringMatching(new RegExp(`^${deal.id}/handoff/`)) }]);
    });

    it('FR-HND-3 · return photos cannot be added at the handoff stage, and outsiders cannot add any', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin);
      expect((await api(seller, 'POST', `/transactions/${deal.id}/photos`, undefined, photo('return'))).status).toBe(400);
      expect((await api(outsider, 'POST', `/transactions/${deal.id}/photos`, undefined, photo())).status).toBe(403);
    });
  });

  describe('FR-HND-4 · a valid scan completes a sale or swap', () => {
    it('FR-HND-4 · token marked used, deal completed, escrow released, both told', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin, 750);
      const done = await ok(handoff(deal.id, seller, buyer));
      expect(done.status).toBe('completed');
      expect(done.escrow.status).toBe('released');
      expect(Number(done.escrow.released_to_seller)).toBe(750);
      expect(await sqlValue(`select bool_and(used) from qr_tokens where transaction_id = $1 and used_at is not null`, [deal.id])).toBe(true);
      for (const u of [seller, buyer]) {
        expect((await inbox(u)).some((n) => n.type === 'handoff_complete' && n.payload?.transaction_id === deal.id)).toBe(true);
      }
    });
  });

  describe('FR-HND-5 · flag a problem at handoff instead of confirming', () => {
    it('FR-HND-5 · either side can report a problem after the QR is shown; the deal becomes disputed', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin);
      await ok(api(seller, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
      const qr = await ok(api(seller, 'POST', `/transactions/${deal.id}/qr`));
      const r = await ok(api(buyer, 'POST', `/transactions/${deal.id}/dispute`, { reason: 'Screen is cracked, not as in the photos.' }));
      expect(r.status).toBe('disputed');
      // The code no longer works: nothing can complete while it is disputed.
      await ok(api(buyer, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
      expect((await api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: qr.payload })).status).toBe(400);
    });

    it('FR-HND-5 · a reason of at least a few words is required', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin);
      expect((await api(buyer, 'POST', `/transactions/${deal.id}/dispute`, { reason: '' })).status).toBe(400);
    });
  });
});

/** SRS §3.7 — what happens when a code expires or someone does not turn up. */
describe('FR-HND-6 · expired QR and no-shows', () => {
  let admin: TestUser;
  let seller: TestUser;
  let buyer: TestUser;

  beforeAll(async () => {
    admin = await makeUser('Admin', { admin: true });
    seller = await makeUser('Seller');
    buyer = await makeUser('Buyer');
  });

  it('FR-HND-6 · when a code expires, the giver shows a new one and that scan works', async () => {
    const { deal } = await paidSellDeal(seller, buyer, admin);
    await ok(api(seller, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
    const old = await ok(api(seller, 'POST', `/transactions/${deal.id}/qr`));
    await sql(`update qr_tokens set expires_at = now() - interval '1 minute' where transaction_id = $1`, [deal.id]);
    await ok(api(buyer, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
    expect((await api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: old.payload })).status).toBe(400);
    const fresh = await ok(api(seller, 'POST', `/transactions/${deal.id}/qr`));
    expect((await ok(api(buyer, 'POST', `/transactions/${deal.id}/scan`, { token: fresh.payload }))).status).toBe('completed');
  });

  it('FR-HND-6 · if the other side does not turn up, either side can call the deal off before the handoff and the buyer is refunded', async () => {
    const { deal, listing } = await paidSellDeal(seller, buyer, admin, 700);
    const r = await ok(api(buyer, 'POST', `/transactions/${deal.id}/cancel`));
    expect(r.status).toBe('refunded');
    expect(Number(r.escrow.refunded_to_buyer)).toBe(700);
    expect(await sqlValue(`select status from listings where id = $1`, [listing.id])).toBe('live');
  });

  it('FR-HND-6 · or report the no-show as a problem, which freezes the money for an admin to decide', async () => {
    const { deal } = await paidSellDeal(seller, buyer, admin);
    const r = await ok(api(buyer, 'POST', `/transactions/${deal.id}/dispute`, { reason: 'Seller did not come to the meeting point twice.' }));
    expect(r.status).toBe('disputed');
    expect(await sqlValue(`select status from escrow_holds where transaction_id = $1`, [deal.id])).toBe('held');
  });
});

/** SRS §3.8 Lend Return Cycle */
describe('FR-LND · Lend return cycle', () => {
  let admin: TestUser;
  let lender: TestUser;
  let borrower: TestUser;

  beforeAll(async () => {
    admin = await makeUser('Admin', { admin: true });
    lender = await makeUser('Lender');
    borrower = await makeUser('Borrower');
  });

  async function lendDeal(title: string, days = 7, deposit = 500) {
    const l = await liveListing(lender, admin, { type: 'lend', title, category: 'Electronics', rent_amount: 40, rent_unit: 'day' });
    const { deal } = await agreedDeal(lender, borrower, l.id, 40, { start_date: day(0), end_date: day(days), deposit_amount: deposit });
    await ok(api(borrower, 'POST', `/transactions/${deal.id}/pay`));
    return { listing: l, deal };
  }

  describe('FR-LND-1 · the deal stays open after handoff', () => {
    it('FR-LND-1 · after the handoff scan the item is with the borrower (in_use), not completed', async () => {
      const { deal } = await lendDeal('Lnd-1 lamp');
      const r = await ok(handoff(deal.id, lender, borrower));
      expect(r.status).toBe('in_use');
      expect(r.stage).toBe('return');
    });
  });

  describe('FR-LND-2 · QR-verified return with return-stage photos', () => {
    it('FR-LND-2 · at return the borrower shows the QR and the lender scans', async () => {
      const { deal } = await lendDeal('Lnd-2 roles');
      await ok(handoff(deal.id, lender, borrower));
      await ok(api(lender, 'POST', `/transactions/${deal.id}/photos`, undefined, photo('return')));
      expect((await api(lender, 'POST', `/transactions/${deal.id}/qr`)).status).toBe(403);
    });

    it('FR-LND-2 · return photos are required from both sides', async () => {
      const { deal } = await lendDeal('Lnd-2 photos');
      await ok(handoff(deal.id, lender, borrower));
      expect((await api(borrower, 'POST', `/transactions/${deal.id}/qr`)).status).toBe(400);
      await ok(api(borrower, 'POST', `/transactions/${deal.id}/photos`, undefined, photo('return')));
      const qr = await ok(api(borrower, 'POST', `/transactions/${deal.id}/qr`));
      expect(qr.purpose).toBe('return');
      expect((await api(lender, 'POST', `/transactions/${deal.id}/scan`, { token: qr.payload })).status).toBe(400);
    });

    it('FR-LND-2 · the handoff QR cannot be reused for the return', async () => {
      const { deal } = await lendDeal('Lnd-2 reuse');
      await ok(api(lender, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
      const handoffQr = await ok(api(lender, 'POST', `/transactions/${deal.id}/qr`));
      await ok(api(borrower, 'POST', `/transactions/${deal.id}/photos`, undefined, photo()));
      await ok(api(borrower, 'POST', `/transactions/${deal.id}/scan`, { token: handoffQr.payload }));
      await ok(api(lender, 'POST', `/transactions/${deal.id}/photos`, undefined, photo('return')));
      expect((await api(lender, 'POST', `/transactions/${deal.id}/scan`, { token: handoffQr.payload })).status).toBe(400);
    });
  });

  describe('FR-LND-3 · due and overdue reminders', () => {
    it('FR-LND-3 · the borrower is reminded the day before it is due', async () => {
      const { deal } = await lendDeal('Lnd-3 due soon', 1);
      await ok(handoff(deal.id, lender, borrower));
      const n = (await inbox(borrower)).find((x) => x.type === 'lend_due' && x.payload?.transaction_id === deal.id);
      expect(n?.payload?.title).toBe('Borrowed item due soon');
    });

    it('FR-LND-3 · an item past its return date is flagged overdue', async () => {
      const { deal } = await lendDeal('Lnd-3 overdue', 3);
      await ok(handoff(deal.id, lender, borrower));
      await sql(`update lend_details set end_date = current_date - 2 where transaction_id = $1`, [deal.id]);
      const n = (await inbox(borrower)).find((x) => x.type === 'lend_due' && x.payload?.transaction_id === deal.id);
      expect(n?.payload?.title).toBe('Borrowed item is overdue');
    });

    it('FR-LND-3 · one reminder per item, not one each time the inbox opens', async () => {
      const { deal } = await lendDeal('Lnd-3 once', 1);
      await ok(handoff(deal.id, lender, borrower));
      await inbox(borrower);
      await inbox(borrower);
      const count = (await inbox(borrower)).filter((x) => x.type === 'lend_due' && x.payload?.transaction_id === deal.id).length;
      expect(count).toBe(1);
    });

    it('FR-LND-3 · nothing is sent for an item not due yet', async () => {
      const { deal } = await lendDeal('Lnd-3 not yet', 10);
      await ok(handoff(deal.id, lender, borrower));
      expect((await inbox(borrower)).some((x) => x.type === 'lend_due' && x.payload?.transaction_id === deal.id)).toBe(false);
    });
  });

  describe('FR-LND-4 · return settles rent and refunds the deposit', () => {
    it('FR-LND-4 · lender gets ₹280 rent, borrower gets the ₹500 deposit back, listing is live again', async () => {
      const { deal, listing } = await lendDeal('Lnd-4 settle', 7, 500);
      await ok(handoff(deal.id, lender, borrower));
      const done = await ok(handoff(deal.id, borrower, lender, 'return'));
      expect(done.status).toBe('completed');
      expect(Number(done.escrow.released_to_seller)).toBe(280);
      expect(Number(done.escrow.refunded_to_buyer)).toBe(500);
      expect(await sqlValue(`select status from listings where id = $1`, [listing.id])).toBe('live');
      expect((await inbox(lender)).some((n) => n.type === 'item_returned' && n.payload?.transaction_id === deal.id)).toBe(true);
    });
  });
});

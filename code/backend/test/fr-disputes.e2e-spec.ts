import { api, fileForm, inbox, makeUser, ok, paidSellDeal, sqlValue, type TestUser } from './e2e/helpers.js';

/** SRS §3.9 Disputes */
describe('FR-DSP · Disputes', () => {
  let admin: TestUser;
  let seller: TestUser;
  let buyer: TestUser;

  beforeAll(async () => {
    admin = await makeUser('Admin', { admin: true });
    seller = await makeUser('Seller');
    buyer = await makeUser('Buyer');
  });

  /** A paid deal, photographed by the seller, then disputed by the buyer. */
  async function disputedDeal(price = 3800, reason = 'Seller never showed up at the library twice.') {
    const { deal } = await paidSellDeal(seller, buyer, admin, price);
    await ok(api(seller, 'POST', `/transactions/${deal.id}/photos`, undefined, { form: fileForm({}, { stage: 'handoff' }) }));
    await ok(api(buyer, 'POST', `/transactions/${deal.id}/dispute`, { reason }));
    const queue = await ok(api(admin, 'GET', '/admin/disputes'));
    return { deal, dispute: queue.find((d: any) => d.transaction_id === deal.id) };
  }

  describe('FR-DSP-1 · one dispute per deal, with a reason', () => {
    it('FR-DSP-1 · a party raises a dispute with a reason', async () => {
      const { deal, dispute } = await disputedDeal();
      expect(dispute).toMatchObject({ reason: 'Seller never showed up at the library twice.', status: 'open', raised_by_role: 'buyer' });
      expect(await sqlValue(`select status from transactions where id = $1`, [deal.id])).toBe('disputed');
    });

    it('FR-DSP-1 · a second dispute on the same deal is refused', async () => {
      const { deal } = await disputedDeal();
      expect((await api(seller, 'POST', `/transactions/${deal.id}/dispute`, { reason: 'Buyer is lying about this deal.' })).status).toBe(400);
      expect(await sqlValue(`select count(*)::int from disputes where transaction_id = $1`, [deal.id])).toBe(1);
    });

    it('FR-DSP-1 · someone outside the deal cannot raise one', async () => {
      const { deal } = await paidSellDeal(seller, buyer, admin);
      const outsider = await makeUser('Outsider');
      expect((await api(outsider, 'POST', `/transactions/${deal.id}/dispute`, { reason: 'I want to interfere here.' })).status).toBe(403);
    });

    it('FR-DSP-1 · a deal not yet paid cannot be disputed', async () => {
      const r = await api(buyer, 'POST', `/transactions/00000000-0000-0000-0000-000000000000/dispute`, { reason: 'No such deal at all.' });
      expect([403, 404]).toContain(r.status);
    });
  });

  describe('FR-DSP-2 · escrow is frozen while a dispute is open', () => {
    it('FR-DSP-2 · money stays held; the deal cannot be cancelled or paid out', async () => {
      const { deal } = await disputedDeal(1200);
      expect(await sqlValue(`select status from escrow_holds where transaction_id = $1`, [deal.id])).toBe('held');
      expect((await api(seller, 'POST', `/transactions/${deal.id}/cancel`)).status).toBe(400);
      expect((await api(buyer, 'POST', `/transactions/${deal.id}/cancel`)).status).toBe(400);
      expect((await api(seller, 'POST', `/transactions/${deal.id}/qr`)).status).toBe(400);
    });
  });

  describe('FR-DSP-3 · admins see open disputes with the condition photos', () => {
    it('FR-DSP-3 · the dispute queue shows the deal and its photos', async () => {
      const { dispute } = await disputedDeal();
      expect(dispute.deal).toBeTruthy();
      expect(dispute.deal.photos.length).toBeGreaterThan(0);
      expect(dispute.deal.photos[0]).toMatchObject({ stage: 'handoff', url: expect.stringContaining('/object/sign/') });
    });

    it('FR-DSP-3 · only admins can open the queue', async () => {
      expect((await api(buyer, 'GET', '/admin/disputes')).status).toBe(403);
    });
  });

  describe('FR-DSP-4 · ask for evidence, then resolve: release or refund', () => {
    it('FR-DSP-4 · an admin marks it under review with a note to both sides', async () => {
      const { dispute } = await disputedDeal();
      await ok(api(admin, 'POST', `/admin/disputes/${dispute.id}/review`, { note: 'Seller, please send a photo.' }));
      expect(await sqlValue(`select status from disputes where id = $1`, [dispute.id])).toBe('under_review');
    });

    it('FR-DSP-4 · resolving for the buyer refunds them', async () => {
      const { deal, dispute } = await disputedDeal(3800);
      await ok(api(admin, 'POST', `/admin/disputes/${dispute.id}/resolve`, { outcome: 'refund', resolution: 'Seller no-show confirmed.' }));
      const d = await ok(api(buyer, 'GET', `/transactions/${deal.id}`));
      expect(d.status).toBe('refunded');
      expect(Number(d.escrow.refunded_to_buyer)).toBe(3800);
    });

    it('FR-DSP-4 · resolving for the seller releases the money to them', async () => {
      const { deal, dispute } = await disputedDeal(900);
      await ok(api(admin, 'POST', `/admin/disputes/${dispute.id}/resolve`, { outcome: 'release', resolution: 'Item matched the photos.' }));
      const d = await ok(api(seller, 'GET', `/transactions/${deal.id}`));
      expect(d.status).toBe('completed');
      expect(Number(d.escrow.released_to_seller)).toBe(900);
    });

    it('FR-DSP-4 · a written resolution is required, and a dispute cannot be resolved twice', async () => {
      const { dispute } = await disputedDeal();
      expect((await api(admin, 'POST', `/admin/disputes/${dispute.id}/resolve`, { outcome: 'refund', resolution: '' })).status).toBe(400);
      await ok(api(admin, 'POST', `/admin/disputes/${dispute.id}/resolve`, { outcome: 'refund', resolution: 'Refunding the buyer.' }));
      expect((await api(admin, 'POST', `/admin/disputes/${dispute.id}/resolve`, { outcome: 'release', resolution: 'Second try.' })).status).toBe(400);
    });

    it('FR-DSP-4 · students cannot resolve disputes', async () => {
      const { dispute } = await disputedDeal();
      expect((await api(buyer, 'POST', `/admin/disputes/${dispute.id}/resolve`, { outcome: 'refund', resolution: 'Give me my money.' })).status).toBe(403);
    });
  });

  describe('FR-DSP-5 · penalties from fixed tiers', () => {
    it('FR-DSP-5 · three tiers: minor ₹50, moderate ₹200, severe ₹500', async () => {
      const tiers = await ok(api(admin, 'GET', '/admin/disputes/penalty-tiers'));
      expect(tiers.map((t: any) => [t.key, t.amount])).toEqual([['minor', 50], ['moderate', 200], ['severe', 500]]);
    });

    it('FR-DSP-5 · a tier sets the amount and adds it to that student’s total', async () => {
      const before = Number(await sqlValue(`select penalty_total from users where id = $1`, [seller.id]));
      const { dispute } = await disputedDeal();
      const r = await ok(api(admin, 'POST', `/admin/disputes/${dispute.id}/resolve`, {
        outcome: 'refund', resolution: 'Wrong item sent.', penalty_tier: 'moderate', penalty_party: 'seller',
      }));
      expect(Number(r.penalty_amount)).toBe(200);
      expect(r.penalty_tier).toBe('moderate');
      expect(Number(await sqlValue(`select penalty_total from users where id = $1`, [seller.id]))).toBe(before + 200);
    });

    it('FR-DSP-5 · a tier needs a party; an unknown tier is refused; a typed amount is ignored', async () => {
      const { dispute } = await disputedDeal();
      const base = { outcome: 'refund', resolution: 'Photos show damage.' };
      expect((await api(admin, 'POST', `/admin/disputes/${dispute.id}/resolve`, { ...base, penalty_tier: 'severe' })).status).toBe(400);
      expect((await api(admin, 'POST', `/admin/disputes/${dispute.id}/resolve`, { ...base, penalty_tier: 'huge', penalty_party: 'seller' })).status).toBe(400);
      const r = await ok(api(admin, 'POST', `/admin/disputes/${dispute.id}/resolve`, { ...base, penalty_amount: 9999, penalty_party: 'seller' }));
      expect(r.penalty_amount).toBeNull();
    });

    it('FR-DSP-5 · the admin sees each side’s earlier penalties while deciding', async () => {
      const { dispute } = await disputedDeal();
      expect(dispute.seller_record.penalties).toBeGreaterThanOrEqual(1);
      expect(dispute.buyer_record).toEqual({ penalty_total: 0, penalties: 0 });
    });

    it('FR-DSP-5 · tiers are admin-only', async () => {
      expect((await api(seller, 'GET', '/admin/disputes/penalty-tiers')).status).toBe(403);
    });
  });

  describe('FR-DSP-6 · both parties are told about every change', () => {
    it('FR-DSP-6 · opened → the other side and admins; review and resolution → both sides', async () => {
      const { deal, dispute } = await disputedDeal();
      const forDeal = (list: any[], type: string) => list.some((n) => n.type === type && n.payload?.transaction_id === deal.id);
      expect(forDeal(await inbox(seller), 'dispute_opened')).toBe(true);
      expect(forDeal(await inbox(admin), 'dispute_opened')).toBe(true);
      await ok(api(admin, 'POST', `/admin/disputes/${dispute.id}/review`, { note: 'Looking into it.' }));
      await ok(api(admin, 'POST', `/admin/disputes/${dispute.id}/resolve`, { outcome: 'refund', resolution: 'Refunded.' }));
      for (const u of [buyer, seller]) {
        const list = await inbox(u);
        expect(forDeal(list, 'dispute_update'), `${u.name} review notice`).toBe(true);
        expect(forDeal(list, 'dispute_resolved'), `${u.name} resolution notice`).toBe(true);
      }
    });
  });
});

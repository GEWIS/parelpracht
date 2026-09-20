import { describe, it, expect } from 'vitest';
import { loginAs, anonAgent } from './agent';
import { createVAT } from './factories/vat';
import { Roles } from '../src/entity/enums/Roles';
import { VAT } from '../src/entity/enums/ValueAddedTax';

describe('VAT endpoints', () => {
  describe('POST /api/VAT/table (getAllVAT)', () => {
    it('returns a paginated list with a count', async () => {
      await createVAT({ category: VAT.HIGH, amount: 2100 });
      await createVAT({ category: VAT.LOW, amount: 900 });
      const { agent } = await loginAs([Roles.GENERAL]);

      const res = await agent.post('/api/VAT/table').send({}).expect(200);

      expect(res.body.count).toBe(2);
      expect(Array.isArray(res.body.list)).toBe(true);
      expect(res.body.list).toHaveLength(2);
      const amounts = res.body.list.map((v: { amount: number }) => v.amount).sort((a: number, b: number) => a - b);
      expect(amounts).toEqual([900, 2100]);
    });

    it('honours pagination (skip/take)', async () => {
      await createVAT({ category: VAT.HIGH, amount: 2100 });
      await createVAT({ category: VAT.LOW, amount: 900 });
      await createVAT({ category: VAT.ZERO, amount: 0 });
      const { agent } = await loginAs([Roles.ADMIN]);

      const res = await agent.post('/api/VAT/table').send({ skip: 0, take: 1 }).expect(200);

      expect(res.body.list).toHaveLength(1);
      expect(res.body.count).toBe(3);
    });

    it('filters on category', async () => {
      await createVAT({ category: VAT.HIGH, amount: 2100 });
      await createVAT({ category: VAT.LOW, amount: 900 });
      const { agent } = await loginAs([Roles.ADMIN]);

      const res = await agent
        .post('/api/VAT/table')
        .send({ filters: [{ column: 'category', values: [VAT.LOW] }] })
        .expect(200);

      expect(res.body.count).toBe(1);
      expect(res.body.list[0].category).toBe(VAT.LOW);
    });

    it('rejects anonymous access with 401', async () => {
      const anon = await anonAgent();
      await anon.post('/api/VAT/table').send({}).expect(401);
    });

    it('rejects a user without GENERAL/ADMIN scope with 401', async () => {
      const { agent } = await loginAs([Roles.AUDIT]);
      await agent.post('/api/VAT/table').send({}).expect(401);
    });
  });

  describe('GET /api/VAT/compact (getVATSummaries)', () => {
    it('returns id and amount only (no category)', async () => {
      await createVAT({ category: VAT.HIGH, amount: 2100 });
      const { agent } = await loginAs([Roles.FINANCIAL]);

      const res = await agent.get('/api/VAT/compact').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      const [summary] = res.body;
      expect(typeof summary.id).toBe('number');
      expect(summary.amount).toBe(2100);
      expect(summary.category).toBeUndefined();
    });

    it('is accessible to SIGNEE and AUDIT roles', async () => {
      await createVAT();
      const signee = await loginAs([Roles.SIGNEE]);
      await signee.agent.get('/api/VAT/compact').expect(200);
      const audit = await loginAs([Roles.AUDIT]);
      await audit.agent.get('/api/VAT/compact').expect(200);
    });

    it('rejects anonymous access with 401', async () => {
      const anon = await anonAgent();
      await anon.get('/api/VAT/compact').expect(401);
    });
  });

  describe('GET /api/VAT/{id} (getVAT)', () => {
    it('returns a single VAT with its products relation', async () => {
      const vat = await createVAT({ category: VAT.LOW, amount: 900 });
      const { agent } = await loginAs([Roles.GENERAL]);

      const res = await agent.get(`/api/VAT/${vat.id}`).expect(200);

      expect(res.body.id).toBe(vat.id);
      expect(res.body.category).toBe(VAT.LOW);
      expect(res.body.amount).toBe(900);
      expect(Array.isArray(res.body.products)).toBe(true);
    });

    it('returns 404 for an unknown id', async () => {
      const { agent } = await loginAs([Roles.ADMIN]);
      await agent.get('/api/VAT/999999').expect(404);
    });

    it('rejects anonymous access with 401', async () => {
      const vat = await createVAT();
      const anon = await anonAgent();
      await anon.get(`/api/VAT/${vat.id}`).expect(401);
    });

    it('rejects a user without GENERAL/ADMIN scope with 401', async () => {
      const vat = await createVAT();
      const { agent } = await loginAs([Roles.FINANCIAL]);
      await agent.get(`/api/VAT/${vat.id}`).expect(401);
    });
  });

  describe('PUT /api/VAT/{id} (updateVAT)', () => {
    it('updates the category and amount of a VAT (ADMIN only)', async () => {
      const vat = await createVAT({ category: VAT.HIGH, amount: 2100 });
      const { agent } = await loginAs([Roles.ADMIN]);

      const res = await agent.put(`/api/VAT/${vat.id}`).send({ category: VAT.LOW, amount: 900 }).expect(200);

      expect(res.body.id).toBe(vat.id);
      expect(res.body.category).toBe(VAT.LOW);
      expect(res.body.amount).toBe(900);
    });

    it('rejects an empty category with 400', async () => {
      const vat = await createVAT();
      const { agent } = await loginAs([Roles.ADMIN]);
      await agent.put(`/api/VAT/${vat.id}`).send({ category: '' }).expect(400);
    });

    it('rejects a non-ADMIN user with 401', async () => {
      const vat = await createVAT();
      const { agent } = await loginAs([Roles.GENERAL]);
      await agent.put(`/api/VAT/${vat.id}`).send({ category: VAT.LOW, amount: 900 }).expect(401);
    });

    it('rejects anonymous access with 401', async () => {
      const vat = await createVAT();
      const anon = await anonAgent();
      await anon.put(`/api/VAT/${vat.id}`).send({ category: VAT.LOW, amount: 900 }).expect(401);
    });
  });
});

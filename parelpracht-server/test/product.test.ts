import { describe, it, expect } from 'vitest';
import { loginAs, anonAgent } from './agent';
import { createProduct, createProductCategory, createValueAddedTax, createProductPricing } from './factories/product';
import { ProductStatus } from '../src/entity/enums/ProductStatus';
import { Roles } from '../src/entity/enums/Roles';

/** A complete, valid create/update body referencing existing FK rows. */
async function validProductBody(overrides: Record<string, unknown> = {}) {
  const category = await createProductCategory();
  const vat = await createValueAddedTax();
  return {
    nameDutch: 'Nieuw Product',
    nameEnglish: 'New Product',
    targetPrice: 12345,
    status: ProductStatus.ACTIVE,
    description: 'Internal description',
    vatId: vat.id,
    categoryId: category.id,
    contractTextDutch: 'Contracttekst NL',
    contractTextEnglish: 'Contract text EN',
    deliverySpecificationDutch: 'Levering NL',
    deliverySpecificationEnglish: 'Delivery EN',
    ...overrides,
  };
}

describe('Product API', () => {
  describe('POST /api/product/table (list)', () => {
    it('lists products with a count', async () => {
      await createProduct({ nameEnglish: 'List Product A' });
      await createProduct({ nameEnglish: 'List Product B' });
      const { agent } = await loginAs();

      const res = await agent.post('/api/product/table').send({ skip: 0, take: 25 }).expect(200);

      expect(res.body.count).toBe(2);
      expect(Array.isArray(res.body.list)).toBe(true);
      expect(res.body.list).toHaveLength(2);
    });

    it('filters by search across name fields', async () => {
      await createProduct({ nameDutch: 'Zoekbaar', nameEnglish: 'Findable' });
      await createProduct({ nameDutch: 'Anders', nameEnglish: 'Other' });
      const { agent } = await loginAs();

      const res = await agent.post('/api/product/table').send({ skip: 0, take: 25, search: 'Findable' }).expect(200);

      expect(res.body.count).toBe(1);
      expect(res.body.list[0].nameEnglish).toBe('Findable');
    });

    it('paginates with skip/take', async () => {
      await createProduct();
      await createProduct();
      await createProduct();
      const { agent } = await loginAs();

      const res = await agent.post('/api/product/table').send({ skip: 0, take: 2 }).expect(200);

      expect(res.body.count).toBe(3);
      expect(res.body.list).toHaveLength(2);
    });
  });

  describe('GET /api/product/compact', () => {
    it('returns compact summaries', async () => {
      const product = await createProduct({ nameEnglish: 'Compact Product' });
      const { agent } = await loginAs();

      const res = await agent.get('/api/product/compact').expect(200);

      const found = res.body.find((p: { id: number }) => p.id === product.id);
      expect(found).toBeDefined();
      expect(found.nameEnglish).toBe('Compact Product');
      expect(found).toHaveProperty('targetPrice');
      expect(found).toHaveProperty('vatId');
      expect(found).toHaveProperty('status');
    });
  });

  describe('GET /api/product/{id}', () => {
    it('returns a single product', async () => {
      const product = await createProduct({ nameEnglish: 'Single Product' });
      const { agent } = await loginAs();

      const res = await agent.get(`/api/product/${product.id}`).expect(200);

      expect(res.body.id).toBe(product.id);
      expect(res.body.nameEnglish).toBe('Single Product');
      // Eager relations exposed by the service.
      expect(Array.isArray(res.body.files)).toBe(true);
      expect(Array.isArray(res.body.activities)).toBe(true);
    });

    it('returns 404 for an unknown product', async () => {
      const { agent } = await loginAs();
      await agent.get('/api/product/999999').expect(404);
    });
  });

  describe('POST /api/product (create)', () => {
    it('creates a product (prices are integer cents)', async () => {
      const body = await validProductBody({ targetPrice: 99900 });
      const { agent } = await loginAs();

      const res = await agent.post('/api/product').send(body).expect(200);

      expect(res.body.id).toBeGreaterThan(0);
      expect(res.body.nameDutch).toBe('Nieuw Product');
      expect(res.body.targetPrice).toBe(99900);
      expect(res.body.categoryId).toBe(body.categoryId);
      expect(res.body.vatId).toBe(body.vatId);
      expect(res.body.status).toBe(ProductStatus.ACTIVE);
    });

    it('rejects a missing required name with 400', async () => {
      const body = await validProductBody({ nameDutch: '' });
      const { agent } = await loginAs();
      await agent.post('/api/product').send(body).expect(400);
    });

    it('rejects a non-positive targetPrice with 400', async () => {
      const body = await validProductBody({ targetPrice: 0 });
      const { agent } = await loginAs();
      await agent.post('/api/product').send(body).expect(400);
    });

    it('rejects an invalid status with 400', async () => {
      const body = await validProductBody({ status: 'BOGUS' });
      const { agent } = await loginAs();
      await agent.post('/api/product').send(body).expect(400);
    });
  });

  describe('PUT /api/product/{id} (update)', () => {
    it('updates a product with a full valid body', async () => {
      const product = await createProduct();
      // The PUT handler runs the FULL product validator, so send a complete body.
      const body = await validProductBody({
        nameEnglish: 'Updated Name',
        targetPrice: 55500,
        categoryId: product.categoryId,
        vatId: product.vatId,
      });
      const { agent } = await loginAs();

      const res = await agent.put(`/api/product/${product.id}`).send(body).expect(200);

      expect(res.body.id).toBe(product.id);
      expect(res.body.nameEnglish).toBe('Updated Name');
      expect(res.body.targetPrice).toBe(55500);
    });

    it('rejects a partial/invalid body with 400', async () => {
      const product = await createProduct();
      const { agent } = await loginAs();
      // Missing the required text fields => full validator fails.
      await agent.put(`/api/product/${product.id}`).send({ nameEnglish: 'Only this' }).expect(400);
    });
  });

  describe('DELETE /api/product/{id}', () => {
    it('deletes a product without instances/files (204)', async () => {
      const product = await createProduct();
      const { agent } = await loginAs();

      await agent.delete(`/api/product/${product.id}`).expect(204);
      await agent.get(`/api/product/${product.id}`).expect(404);
    });
  });

  describe('product pricing', () => {
    it('adds a pricing attribute seeded empty (200)', async () => {
      const product = await createProduct();
      const { agent } = await loginAs();

      const res = await agent.post(`/api/product/${product.id}/pricing`).expect(200);

      // Shares the product's primary key, seeded with an empty description/table.
      expect(res.body.id).toBe(product.id);
      expect(res.body.description).toBe('');
      expect(res.body.data).toEqual([['']]);
    });

    it('exposes the pricing nested on the product after adding', async () => {
      const product = await createProduct();
      const { agent } = await loginAs();
      await agent.post(`/api/product/${product.id}/pricing`).expect(200);

      const res = await agent.get(`/api/product/${product.id}`).expect(200);
      expect(res.body.pricing).toBeTruthy();
      expect(res.body.pricing.id).toBe(product.id);
    });

    it('rejects adding pricing twice (400)', async () => {
      const product = await createProduct();
      const { agent } = await loginAs();

      await agent.post(`/api/product/${product.id}/pricing`).expect(200);
      await agent.post(`/api/product/${product.id}/pricing`).expect(400);
    });

    it('updates an existing pricing attribute', async () => {
      const product = await createProduct();
      await createProductPricing(product.id, { description: 'old', data: [['old']] });
      const { agent } = await loginAs();

      const res = await agent
        .put(`/api/product/${product.id}/pricing`)
        .send({
          description: 'New description',
          data: [
            ['A', 'B'],
            ['1', '2'],
          ],
        })
        .expect(200);

      expect(res.body.description).toBe('New description');
      expect(res.body.data).toEqual([
        ['A', 'B'],
        ['1', '2'],
      ]);
    });

    it('deletes a pricing attribute (204)', async () => {
      const product = await createProduct();
      await createProductPricing(product.id);
      const { agent } = await loginAs();

      await agent.delete(`/api/product/${product.id}/pricing`).expect(204);

      const res = await agent.get(`/api/product/${product.id}`).expect(200);
      expect(res.body.pricing == null).toBe(true);
    });

    it('returns 404 when updating pricing that does not exist', async () => {
      const product = await createProduct();
      const { agent } = await loginAs();
      await agent.put(`/api/product/${product.id}/pricing`).send({ description: 'x' }).expect(404);
    });
  });

  describe('permissions', () => {
    it('rejects anonymous access to the table endpoint (401)', async () => {
      const anon = await anonAgent();
      await anon.post('/api/product/table').send({ skip: 0, take: 25 }).expect(401);
    });

    it('rejects anonymous get (401)', async () => {
      const product = await createProduct();
      const anon = await anonAgent();
      await anon.get(`/api/product/${product.id}`).expect(401);
    });

    it('forbids an AUDIT-only user from the table endpoint (401)', async () => {
      // table requires GENERAL/ADMIN; AUDIT can hit /compact but not /table.
      // Note: this API returns 401 (not 403) for insufficient scope (see expressAuthentication).
      const { agent } = await loginAs([Roles.AUDIT]);
      await agent.post('/api/product/table').send({ skip: 0, take: 25 }).expect(401);
    });

    it('allows an AUDIT-only user to hit /compact (200)', async () => {
      await createProduct();
      const { agent } = await loginAs([Roles.AUDIT]);
      await agent.get('/api/product/compact').expect(200);
    });

    it('forbids a non-admin from creating a product (401)', async () => {
      // create requires ADMIN.
      const body = await validProductBody();
      const { agent } = await loginAs([Roles.GENERAL]);
      await agent.post('/api/product').send(body).expect(401);
    });

    it('forbids a non-admin from adding pricing (401)', async () => {
      const product = await createProduct();
      // pricing mutations require ADMIN; GENERAL is insufficient.
      const { agent } = await loginAs([Roles.GENERAL]);
      await agent.post(`/api/product/${product.id}/pricing`).expect(401);
    });
  });
});

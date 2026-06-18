import { describe, it, expect } from 'vitest';
import { loginAs, anonAgent } from './agent';
import { getDataSource } from './db';
import { createCompany } from './factories/company';
import { createUser } from './factories/user';
import { createInvoice, createProductInstance, createProduct } from './factories/invoice';
import { Roles } from '../src/entity/enums/Roles';
import { VAT } from '../src/entity/enums/ValueAddedTax';
import { InvoiceStatus } from '../src/entity/enums/InvoiceStatus';

describe('Invoice API', () => {
  describe('POST /api/invoice/table (list)', () => {
    it('returns the list and count of invoices', async () => {
      const company = await createCompany({ name: 'List Co BV' });
      const { user } = await createUser();
      await createInvoice({ company, createdBy: user, overrides: { title: 'Invoice Alpha' } });
      await createInvoice({ company, createdBy: user, overrides: { title: 'Invoice Beta' } });

      const { agent } = await loginAs();
      const res = await agent.post('/api/invoice/table').send({ skip: 0, take: 25 }).expect(200);

      expect(res.body.count).toBe(2);
      expect(Array.isArray(res.body.list)).toBe(true);
      expect(res.body.list.map((i: { title: string }) => i.title).sort()).toEqual(['Invoice Alpha', 'Invoice Beta']);
    });

    it('honours pagination (skip/take)', async () => {
      const company = await createCompany();
      const { user } = await createUser();
      await createInvoice({ company, createdBy: user });
      await createInvoice({ company, createdBy: user });
      await createInvoice({ company, createdBy: user });

      const { agent } = await loginAs();
      const res = await agent.post('/api/invoice/table').send({ skip: 0, take: 2 }).expect(200);

      expect(res.body.list).toHaveLength(2);
      // count is the total ignoring pagination
      expect(res.body.count).toBe(3);
    });

    it('filters by search term on title', async () => {
      const company = await createCompany();
      const { user } = await createUser();
      await createInvoice({ company, createdBy: user, overrides: { title: 'Findme Unique Title' } });
      await createInvoice({ company, createdBy: user, overrides: { title: 'Some Other Invoice' } });

      const { agent } = await loginAs();
      const res = await agent.post('/api/invoice/table').send({ search: 'Findme Unique' }).expect(200);

      expect(res.body.list).toHaveLength(1);
      expect(res.body.list[0].title).toBe('Findme Unique Title');
    });
  });

  describe('GET /api/invoice/{id}', () => {
    it('returns the invoice with its company and products', async () => {
      const { invoice, company } = await createInvoice({
        productCount: 1,
        basePrice: 50000,
        discount: 5000,
        vatCategory: VAT.HIGH,
      });

      const { agent } = await loginAs();
      const res = await agent.get(`/api/invoice/${invoice.id}`).expect(200);

      expect(res.body.id).toBe(invoice.id);
      expect(res.body.companyId).toBe(company.id);
      expect(res.body.company.id).toBe(company.id);
      expect(res.body.products).toHaveLength(1);
      // Money is stored in cents on the product instance.
      expect(res.body.products[0].basePrice).toBe(50000);
      expect(res.body.products[0].discount).toBe(5000);
      // VAT category/amount is carried by the related product.
      expect(res.body.products[0].product.valueAddedTax.category).toBe(VAT.HIGH);
      expect(res.body.products[0].product.valueAddedTax.amount).toBe(2100);
    });

    it('returns 404 for an unknown invoice', async () => {
      const { agent } = await loginAs();
      await agent.get('/api/invoice/999999').expect(404);
    });
  });

  describe('POST /api/invoice (create)', () => {
    it('creates an invoice attached to a company, defaulting assignee/creator to the actor', async () => {
      const company = await createCompany();
      const { agent, user } = await loginAs([Roles.GENERAL]);

      const res = await agent
        .post('/api/invoice')
        .send({
          title: 'Created Invoice',
          companyId: company.id,
          productInstanceIds: [],
        })
        .expect(200);

      expect(res.body.id).toBeGreaterThan(0);
      expect(res.body.title).toBe('Created Invoice');
      expect(res.body.companyId).toBe(company.id);
      // assignedTo and createdBy both default to the acting user.
      expect(res.body.createdById).toBe(user.id);
      expect(res.body.assignedToId).toBe(user.id);
      // A CREATED status activity is created alongside the invoice.
      const statuses = res.body.activities.filter((a: { type: string }) => a.type === 'STATUS');
      expect(statuses).toHaveLength(1);
      expect(statuses[0].subType).toBe(InvoiceStatus.CREATED);
    });

    it('creates an invoice with product instances of the same company', async () => {
      const company = await createCompany();
      const { user } = await createUser();
      const instance = await createProductInstance({ company, createdBy: user });

      const { agent } = await loginAs([Roles.GENERAL]);
      const res = await agent
        .post('/api/invoice')
        .send({
          title: 'With Products',
          companyId: company.id,
          productInstanceIds: [instance.id],
        })
        .expect(200);

      expect(res.body.companyId).toBe(company.id);
      expect(res.body.id).toBeGreaterThan(0);
    });

    it('rejects a product instance belonging to a different company', async () => {
      const companyA = await createCompany();
      const companyB = await createCompany();
      const { user } = await createUser();
      // Instance hangs off companyB's contract.
      const instance = await createProductInstance({ company: companyB, createdBy: user });

      const { agent } = await loginAs([Roles.GENERAL]);
      await agent
        .post('/api/invoice')
        .send({
          title: 'Mismatched',
          companyId: companyA.id,
          productInstanceIds: [instance.id],
        })
        .expect(400);
    });
  });

  describe('PUT /api/invoice/{id} (update)', () => {
    it('updates editable fields', async () => {
      const { invoice } = await createInvoice();

      const { agent } = await loginAs([Roles.GENERAL]);
      const res = await agent
        .put(`/api/invoice/${invoice.id}`)
        .send({ title: 'Updated Title', poNumber: 'PO-12345' })
        .expect(200);

      expect(res.body.id).toBe(invoice.id);
      expect(res.body.title).toBe('Updated Title');
      expect(res.body.poNumber).toBe('PO-12345');
    });

    it('rejects moving the start date earlier than the original', async () => {
      const { invoice } = await createInvoice({ overrides: { startDate: new Date('2030-06-01') } });

      const { agent } = await loginAs([Roles.GENERAL]);
      await agent.put(`/api/invoice/${invoice.id}`).send({ title: invoice.title, startDate: '2020-01-01' }).expect(400);
    });
  });

  describe('DELETE /api/invoice/{id}', () => {
    it('deletes an invoice with no products and only the CREATED status', async () => {
      const { invoice } = await createInvoice();

      const { agent } = await loginAs([Roles.GENERAL]);
      const res = await agent.delete(`/api/invoice/${invoice.id}`);
      // tsoa emits 204 for void handlers; accept 200 too for robustness.
      expect([200, 204]).toContain(res.status);

      await agent.get(`/api/invoice/${invoice.id}`).expect(404);
    });

    it('refuses to delete an invoice that has products', async () => {
      const { invoice } = await createInvoice({ productCount: 1 });

      const { agent } = await loginAs([Roles.GENERAL]);
      await agent.delete(`/api/invoice/${invoice.id}`).expect(400);

      // Still retrievable afterwards.
      await agent.get(`/api/invoice/${invoice.id}`).expect(200);
    });
  });

  describe('product instance management on an invoice', () => {
    it('adds and removes a product instance from an invoice', async () => {
      const company = await createCompany();
      const { user } = await createUser();
      const { invoice } = await createInvoice({ company, createdBy: user });
      const instance = await createProductInstance({ company, createdBy: user });

      const { agent } = await loginAs([Roles.GENERAL]);

      // The controller takes a productId that is actually a ProductInstance id.
      const addRes = await agent
        .post(`/api/invoice/${invoice.id}/product`)
        .send({ productId: instance.id })
        .expect(200);
      expect(addRes.body.invoiceId).toBe(invoice.id);

      // It now shows up on the invoice.
      const withProduct = await agent.get(`/api/invoice/${invoice.id}`).expect(200);
      expect(withProduct.body.products.map((p: { id: number }) => p.id)).toContain(instance.id);

      const delRes = await agent.delete(`/api/invoice/${invoice.id}/product/${instance.id}`);
      expect([200, 204]).toContain(delRes.status);

      const cleared = await agent.get(`/api/invoice/${invoice.id}`).expect(200);
      expect(cleared.body.products).toHaveLength(0);
    });
  });

  describe('financial / summary endpoints', () => {
    it('GET /api/invoice/compact returns summaries with a summed value', async () => {
      // value = sum(basePrice - discount) over the invoice's product instances.
      const { invoice, company } = await createInvoice({
        productCount: 2,
        basePrice: 100000,
        discount: 10000,
        vatCategory: VAT.HIGH,
      });

      const { agent } = await loginAs();
      const res = await agent.get('/api/invoice/compact').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const summary = res.body.find((s: { id: number }) => s.id === invoice.id);
      expect(summary).toBeDefined();
      expect(summary.companyId).toBe(company.id);
      expect(summary.status).toBe(InvoiceStatus.CREATED);
      // 2 instances * (100000 - 10000) = 180000 cents.
      expect(Number(summary.value)).toBe(180000);
    });

    it('GET /api/invoice/expired returns an array', async () => {
      await createInvoice();
      const { agent } = await loginAs();
      const res = await agent.get('/api/invoice/expired').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('PUT /api/invoice/lastseen succeeds for a FINANCIAL user', async () => {
      // lastseen is FINANCIAL-gated and persists a server setting (void response).
      const { agent } = await loginAs([Roles.FINANCIAL]);
      const res = await agent.put('/api/invoice/lastseen');
      expect([200, 204]).toContain(res.status);
    });
  });

  describe('VAT categories', () => {
    it('exposes the LOW vat category and amount on an invoiced product', async () => {
      const company = await createCompany();
      const { user } = await createUser();
      const { invoice } = await createInvoice({ company, createdBy: user });
      const product = await createProduct({}, VAT.LOW);
      const instance = await createProductInstance({ company, createdBy: user });
      // Re-point the instance at the LOW-vat product (productId is readonly at the
      // entity level, so update it via raw SQL).
      const ds = await getDataSource();
      await ds.query('UPDATE product_instance SET productId = ? WHERE id = ?', [product.id, instance.id]);

      const { agent } = await loginAs([Roles.GENERAL]);
      await agent.post(`/api/invoice/${invoice.id}/product`).send({ productId: instance.id }).expect(200);

      const res = await agent.get(`/api/invoice/${invoice.id}`).expect(200);
      const invoiced = res.body.products.find((p: { id: number }) => p.id === instance.id);
      expect(invoiced.product.valueAddedTax.category).toBe(VAT.LOW);
      expect(invoiced.product.valueAddedTax.amount).toBe(900);
    });
  });

  describe('permissions', () => {
    it('rejects anonymous access to the invoice list', async () => {
      const anon = await anonAgent();
      await anon.post('/api/invoice/table').send({ skip: 0, take: 25 }).expect(401);
    });

    it('rejects anonymous access to the finance-gated lastseen endpoint', async () => {
      const anon = await anonAgent();
      await anon.put('/api/invoice/lastseen').expect(401);
    });

    it('rejects a non-FINANCIAL user on the finance-gated lastseen endpoint', async () => {
      // lastseen is @Security('local', ['FINANCIAL']); a GENERAL user is rejected.
      const { agent } = await loginAs([Roles.GENERAL]);
      await agent.put('/api/invoice/lastseen').expect(401);
    });

    it('rejects an AUDIT-only user from creating an invoice (create is GENERAL/ADMIN)', async () => {
      const company = await createCompany();
      const { agent } = await loginAs([Roles.AUDIT]);
      await agent
        .post('/api/invoice')
        .send({ title: 'Nope', companyId: company.id, productInstanceIds: [] })
        .expect(401);
    });

    it('allows an AUDIT user to read the invoice list', async () => {
      // table is also granted to AUDIT.
      const company = await createCompany();
      const { user } = await createUser();
      await createInvoice({ company, createdBy: user });

      const { agent } = await loginAs([Roles.AUDIT]);
      const res = await agent.post('/api/invoice/table').send({ skip: 0, take: 25 }).expect(200);
      expect(res.body.count).toBe(1);
    });
  });
});

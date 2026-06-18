import { describe, it, expect } from 'vitest';
import { loginAs, anonAgent } from './agent';
import { createUser } from './factories/user';
import { Roles } from '../src/entity/enums/Roles';
import { ContractStatus } from '../src/entity/enums/ContractStatus';
import { ProductInstanceStatus } from '../src/entity/enums/ProductActivityStatus';
import { ActivityType } from '../src/entity/enums/ActivityType';
import { Language } from '../src/entity/enums/Language';
import { ContractType, ReturnFileType } from '../src/pdfgenerator/GenSettings';
import { CompanyStatus } from '../src/entity/enums/CompanyStatus';
import { ContactFunction } from '../src/entity/enums/ContactFunction';
import { createCompany } from './factories/company';
import { createContact } from './factories/contact';
import { createProduct } from './factories/product';
import { createContract, addProductInstance } from './factories/contract';

describe('Contract: list (POST /contract/table)', () => {
  it('returns the contracts with a total count', async () => {
    const { contract } = await createContract();
    const { agent } = await loginAs();

    const res = await agent.post('/api/contract/table').send({ skip: 0, take: 25 }).expect(200);

    expect(res.body.count).toBe(1);
    expect(Array.isArray(res.body.list)).toBe(true);
    expect(res.body.list.map((c: { id: number }) => c.id)).toContain(contract.id);
  });

  it('honours pagination (take/skip)', async () => {
    const company = await createCompany();
    const contact = await createContact({ companyId: company.id });
    await createContract({ company, contact });
    await createContract({ company, contact });
    await createContract({ company, contact });
    const { agent } = await loginAs();

    const res = await agent.post('/api/contract/table').send({ skip: 0, take: 2 }).expect(200);

    expect(res.body.count).toBe(3);
    expect(res.body.list).toHaveLength(2);
  });

  it('filters by search term on the title', async () => {
    const company = await createCompany();
    const contact = await createContact({ companyId: company.id });
    await createContract({ company, contact, overrides: { title: 'Unicorn Sponsorship' } });
    await createContract({ company, contact, overrides: { title: 'Boring Banner Deal' } });
    const { agent } = await loginAs();

    const res = await agent.post('/api/contract/table').send({ skip: 0, take: 25, search: 'Unicorn' }).expect(200);

    expect(res.body.count).toBe(1);
    expect(res.body.list[0].title).toBe('Unicorn Sponsorship');
  });

  it('rejects an anonymous caller with 401', async () => {
    const anon = await anonAgent();
    await anon.post('/api/contract/table').send({ skip: 0, take: 25 }).expect(401);
  });
});

describe('Contract: get by id (GET /contract/{id})', () => {
  it('returns the contract with its relations', async () => {
    const { contract, company } = await createContract();
    const { agent } = await loginAs();

    const res = await agent.get(`/api/contract/${contract.id}`).expect(200);

    expect(res.body.id).toBe(contract.id);
    expect(res.body.title).toBe(contract.title);
    expect(res.body.company.id).toBe(company.id);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(Array.isArray(res.body.activities)).toBe(true);
  });

  it('returns 404 for an unknown contract', async () => {
    const { agent } = await loginAs();
    await agent.get('/api/contract/999999').expect(404);
  });

  it('rejects an anonymous caller with 401', async () => {
    const { contract } = await createContract();
    const anon = await anonAgent();
    await anon.get(`/api/contract/${contract.id}`).expect(401);
  });
});

describe('Contract: create (POST /contract)', () => {
  it('creates a contract and seeds a CREATED status activity', async () => {
    const company = await createCompany();
    const contact = await createContact({ companyId: company.id });
    const { agent, user } = await loginAs([Roles.GENERAL]);

    const res = await agent
      .post('/api/contract')
      .send({
        title: 'New Sponsorship',
        companyId: company.id,
        contactId: contact.id,
        comments: 'Looks promising',
      })
      .expect(200);

    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.title).toBe('New Sponsorship');
    expect(res.body.companyId).toBe(company.id);
    expect(res.body.contactId).toBe(contact.id);
    expect(res.body.createdById).toBe(user.id);
    // assignedToId defaults to the actor when none is supplied.
    expect(res.body.assignedToId).toBe(user.id);

    const statuses = res.body.activities.filter((a: { type: string }) => a.type === ActivityType.STATUS);
    expect(statuses).toHaveLength(1);
    expect(statuses[0].subType).toBe(ContractStatus.CREATED);
  });

  it('assigns the contract to the supplied assignedToId', async () => {
    const company = await createCompany();
    const contact = await createContact({ companyId: company.id });
    const { user: assignee } = await createUser({}, [Roles.GENERAL]);
    const { agent } = await loginAs([Roles.ADMIN]);

    const res = await agent
      .post('/api/contract')
      .send({
        title: 'Assigned contract',
        companyId: company.id,
        contactId: contact.id,
        assignedToId: assignee.id,
      })
      .expect(200);

    expect(res.body.assignedToId).toBe(assignee.id);
  });

  it('rejects creation with a blank title (400)', async () => {
    const company = await createCompany();
    const contact = await createContact({ companyId: company.id });
    const { agent } = await loginAs([Roles.GENERAL]);

    await agent.post('/api/contract').send({ title: '', companyId: company.id, contactId: contact.id }).expect(400);
  });

  it('refuses a contract for an inactive company (400)', async () => {
    const company = await createCompany({ status: CompanyStatus.INACTIVE });
    const contact = await createContact({ companyId: company.id });
    const { agent } = await loginAs([Roles.GENERAL]);

    await agent
      .post('/api/contract')
      .send({ title: 'No deal', companyId: company.id, contactId: contact.id })
      .expect(400);
  });

  it('refuses a contract closed with an inactive (OLD) contact (400)', async () => {
    const company = await createCompany();
    const contact = await createContact({ companyId: company.id, function: ContactFunction.OLD });
    const { agent } = await loginAs([Roles.GENERAL]);

    await agent
      .post('/api/contract')
      .send({ title: 'No deal', companyId: company.id, contactId: contact.id })
      .expect(400);
  });

  it('forbids creation for a user without GENERAL/ADMIN (401)', async () => {
    const company = await createCompany();
    const contact = await createContact({ companyId: company.id });
    // SIGNEE can read contracts but not create them.
    const { agent } = await loginAs([Roles.SIGNEE]);

    await agent.post('/api/contract').send({ title: 'Nope', companyId: company.id, contactId: contact.id }).expect(401);
  });

  it('rejects an anonymous caller with 401', async () => {
    const company = await createCompany();
    const contact = await createContact({ companyId: company.id });
    const anon = await anonAgent();

    await anon.post('/api/contract').send({ title: 'Nope', companyId: company.id, contactId: contact.id }).expect(401);
  });
});

describe('Contract: add a product instance (POST /contract/{id}/product)', () => {
  it('adds a product instance with base price/discount in cents', async () => {
    const { contract } = await createContract({ assignedTo: (await loginAs()).user });
    const product = await createProduct();
    const { agent } = await loginAs([Roles.GENERAL]);

    const res = await agent
      .post(`/api/contract/${contract.id}/product`)
      .send({ productId: product.id, basePrice: 75000, discount: 5000, details: 'Gold tier' })
      .expect(200);

    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.contractId).toBe(contract.id);
    expect(res.body.productId).toBe(product.id);
    expect(res.body.basePrice).toBe(75000);
    expect(res.body.discount).toBe(5000);

    // A NOTDELIVERED status activity is created alongside the instance.
    const statuses = res.body.activities.filter((a: { type: string }) => a.type === ActivityType.STATUS);
    expect(statuses).toHaveLength(1);
    expect(statuses[0].subType).toBe(ProductInstanceStatus.NOTDELIVERED);

    // The product instance shows up when re-fetching the contract.
    const reload = await agent.get(`/api/contract/${contract.id}`).expect(200);
    expect(reload.body.products.map((p: { id: number }) => p.id)).toContain(res.body.id);
  });

  it('rejects a non-integer basePrice (400)', async () => {
    const { contract } = await createContract();
    const product = await createProduct();
    const { agent } = await loginAs([Roles.GENERAL]);

    await agent
      .post(`/api/contract/${contract.id}/product`)
      .send({ productId: product.id, basePrice: 'free', details: '' })
      .expect(400);
  });

  it('rejects an anonymous caller with 401', async () => {
    const { contract } = await createContract();
    const product = await createProduct();
    const anon = await anonAgent();

    await anon
      .post(`/api/contract/${contract.id}/product`)
      .send({ productId: product.id, basePrice: 1000, details: '' })
      .expect(401);
  });
});

describe('Contract: update (PUT /contract/{id})', () => {
  it('updates the title and records an EDIT activity', async () => {
    const { user } = await loginAs();
    const { contract, company, contact } = await createContract({ assignedTo: user, createdBy: user });
    const { agent } = await loginAs([Roles.GENERAL]);

    const res = await agent
      .put(`/api/contract/${contract.id}`)
      .send({
        title: 'Renamed contract',
        companyId: company.id,
        contactId: contact.id,
      })
      .expect(200);

    expect(res.body.id).toBe(contract.id);
    expect(res.body.title).toBe('Renamed contract');

    const edits = res.body.activities.filter((a: { type: string }) => a.type === ActivityType.EDIT);
    expect(edits.length).toBeGreaterThanOrEqual(1);
  });

  it('forbids updating for a SIGNEE-only user (401)', async () => {
    const { contract, company, contact } = await createContract();
    const { agent } = await loginAs([Roles.SIGNEE]);

    await agent
      .put(`/api/contract/${contract.id}`)
      .send({ title: 'Hijack', companyId: company.id, contactId: contact.id })
      .expect(401);
  });
});

describe('Contract: delete (DELETE /contract/{id})', () => {
  it('deletes a contract that has no products and no extra statuses', async () => {
    const { contract } = await createContract();
    const { agent } = await loginAs([Roles.ADMIN]);

    await agent.delete(`/api/contract/${contract.id}`).expect(204);

    await agent.get(`/api/contract/${contract.id}`).expect(404);
  });

  it('refuses to delete a contract that still has products (400)', async () => {
    const { contract } = await createContract();
    await addProductInstance(contract.id);
    const { agent } = await loginAs([Roles.ADMIN]);

    await agent.delete(`/api/contract/${contract.id}`).expect(400);

    // The contract is still there.
    await agent.get(`/api/contract/${contract.id}`).expect(200);
  });

  it('forbids deletion for a SIGNEE-only user (401)', async () => {
    const { contract } = await createContract();
    const { agent } = await loginAs([Roles.SIGNEE]);

    await agent.delete(`/api/contract/${contract.id}`).expect(401);
  });

  it('rejects an anonymous caller with 401', async () => {
    const { contract } = await createContract();
    const anon = await anonAgent();

    await anon.delete(`/api/contract/${contract.id}`).expect(401);
  });
});

describe('Contract: product instance update + delete', () => {
  it('updates a product instance price', async () => {
    const { contract } = await createContract();
    const instance = await addProductInstance(contract.id, { basePrice: 10000, discount: 0 });
    const { agent } = await loginAs([Roles.GENERAL]);

    const res = await agent
      .put(`/api/contract/${contract.id}/product/${instance.id}`)
      .send({ productId: instance.productId, basePrice: 20000, discount: 1000, details: 'bumped' })
      .expect(200);

    expect(res.body.id).toBe(instance.id);
    expect(res.body.basePrice).toBe(20000);
    expect(res.body.discount).toBe(1000);
  });

  it('deletes a freshly added product instance', async () => {
    const { contract } = await createContract({ assignedTo: (await loginAs()).user });
    const product = await createProduct();
    const { agent } = await loginAs([Roles.GENERAL]);

    // Add via the API so it carries exactly one (CREATED/NOTDELIVERED) status.
    const added = await agent
      .post(`/api/contract/${contract.id}/product`)
      .send({ productId: product.id, basePrice: 1000, details: '' })
      .expect(200);

    await agent.delete(`/api/contract/${contract.id}/product/${added.body.id}`).expect(204);

    const reload = await agent.get(`/api/contract/${contract.id}`).expect(200);
    expect(reload.body.products.map((p: { id: number }) => p.id)).not.toContain(added.body.id);
  });

  it('returns 400 when the product instance does not belong to the contract', async () => {
    const { contract: a } = await createContract();
    const { contract: b } = await createContract();
    const instance = await addProductInstance(b.id);
    const { agent } = await loginAs([Roles.GENERAL]);

    await agent
      .put(`/api/contract/${a.id}/product/${instance.id}`)
      .send({ productId: instance.productId, basePrice: 5000, details: '' })
      .expect(400);
  });

  it('rejects an anonymous caller deleting a product instance with 401', async () => {
    const { contract } = await createContract();
    const instance = await addProductInstance(contract.id);
    const anon = await anonAgent();

    await anon.delete(`/api/contract/${contract.id}/product/${instance.id}`).expect(401);
  });
});

describe('Contract: status activities', () => {
  it('adds a status activity to a contract', async () => {
    const { contract } = await createContract();
    const { agent } = await loginAs([Roles.GENERAL]);

    const res = await agent
      .post(`/api/contract/${contract.id}/status`)
      .send({ subType: ContractStatus.PROPOSED, description: 'Sent to the board' })
      .expect(200);

    expect(res.body.subType).toBe(ContractStatus.PROPOSED);
    expect(res.body.type).toBe(ActivityType.STATUS);
  });

  it('rejects an unknown status subType (400)', async () => {
    const { contract } = await createContract();
    const { agent } = await loginAs([Roles.GENERAL]);

    await agent.post(`/api/contract/${contract.id}/status`).send({ subType: 'NONSENSE', description: '' }).expect(400);
  });
});

describe('Contract: PDF file generation (POST /contract/{id}/file/generate)', () => {
  // The actual PDF/LaTeX generation shells out, so we only assert the auth guard
  // and the request validation here rather than driving a real render.
  it('rejects an anonymous caller with 401', async () => {
    const { contract } = await createContract();
    const anon = await anonAgent();

    await anon
      .post(`/api/contract/${contract.id}/file/generate`)
      .send({
        language: Language.ENGLISH,
        contentType: ContractType.CONTRACT,
        fileType: ReturnFileType.PDF,
        showDiscountPercentages: true,
        saveToDisk: false,
        signee1Id: 1,
        signee2Id: 1,
        recipientId: 1,
      })
      .expect(401);
  });

  it('forbids a SIGNEE-only user from generating a file (401)', async () => {
    const { contract } = await createContract();
    const { agent } = await loginAs([Roles.SIGNEE]);

    await agent
      .post(`/api/contract/${contract.id}/file/generate`)
      .send({
        language: Language.ENGLISH,
        contentType: ContractType.CONTRACT,
        fileType: ReturnFileType.PDF,
        showDiscountPercentages: true,
        saveToDisk: false,
        signee1Id: 1,
        signee2Id: 1,
        recipientId: 1,
      })
      .expect(401);
  });

  it('rejects an invalid generation request body for an authorized user (400)', async () => {
    const { contract } = await createContract();
    const { agent } = await loginAs([Roles.GENERAL]);

    // Missing/invalid fields => validation fails before any LaTeX is invoked.
    await agent.post(`/api/contract/${contract.id}/file/generate`).send({ language: 'KLINGON' }).expect(400);
  });
});

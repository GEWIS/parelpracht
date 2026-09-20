import { describe, it, expect } from 'vitest';
import { loginAs, anonAgent } from './agent';
import { createCompany } from './factories/company';
import { createContact } from './factories/contact';
import { Roles } from '../src/entity/enums/Roles';
import { Gender } from '../src/entity/enums/Gender';
import { ContactFunction } from '../src/entity/enums/ContactFunction';
import type { ContactParams } from '../src/services/ContactService';

function contactPayload(companyId: number, overrides: Partial<ContactParams> = {}): ContactParams {
  return {
    gender: Gender.MALE,
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.org',
    companyId,
    function: ContactFunction.NORMAL,
    ...overrides,
  };
}

describe('ContactController', () => {
  describe('POST /api/contact/table (list)', () => {
    it('returns { list, count } and respects pagination', async () => {
      const company = await createCompany();
      await createContact({ companyId: company.id, lastName: 'One' });
      await createContact({ companyId: company.id, lastName: 'Two' });
      await createContact({ companyId: company.id, lastName: 'Three' });
      const { agent } = await loginAs();

      const res = await agent.post('/api/contact/table').send({ skip: 0, take: 2 }).expect(200);

      expect(res.body).toHaveProperty('list');
      expect(res.body).toHaveProperty('count');
      expect(Array.isArray(res.body.list)).toBe(true);
      expect(res.body.count).toBe(3);
      expect(res.body.list).toHaveLength(2);
    });

    it('filters on a direct column', async () => {
      const company = await createCompany();
      await createContact({ companyId: company.id, function: ContactFunction.PRIMARY });
      await createContact({ companyId: company.id, function: ContactFunction.NORMAL });
      const { agent } = await loginAs();

      const res = await agent
        .post('/api/contact/table')
        .send({ filters: [{ column: 'function', values: [ContactFunction.PRIMARY] }] })
        .expect(200);

      expect(res.body.count).toBe(1);
      expect(res.body.list[0].function).toBe(ContactFunction.PRIMARY);
    });
  });

  describe('GET /api/contact/compact', () => {
    it('returns compact summaries', async () => {
      const company = await createCompany();
      await createContact({ companyId: company.id, lastName: 'Compacted' });
      const { agent } = await loginAs();

      const res = await agent.get('/api/contact/compact').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const names = res.body.map((c: { lastName: string }) => c.lastName);
      expect(names).toContain('Compacted');
    });
  });

  describe('GET /api/contact/{id}', () => {
    it('returns a single contact with its company relation', async () => {
      const company = await createCompany({ name: 'Owner BV' });
      const contact = await createContact({ companyId: company.id, lastName: 'Findme' });
      const { agent } = await loginAs();

      const res = await agent.get(`/api/contact/${contact.id}`).expect(200);

      expect(res.body.id).toBe(contact.id);
      expect(res.body.lastName).toBe('Findme');
      expect(res.body.company.id).toBe(company.id);
      expect(Array.isArray(res.body.contracts)).toBe(true);
    });

    it('returns 404 for an unknown id', async () => {
      const { agent } = await loginAs();

      const res = await agent.get('/api/contact/999999').expect(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/contact (create)', () => {
    it('creates a contact and returns it', async () => {
      const company = await createCompany();
      const { agent } = await loginAs();

      const res = await agent
        .post('/api/contact')
        .send(contactPayload(company.id, { lastName: 'Created', email: 'created@example.org' }))
        .expect(200);

      expect(res.body.id).toBeGreaterThan(0);
      expect(res.body.lastName).toBe('Created');
      expect(res.body.companyId).toBe(company.id);
      expect(res.body.function).toBe(ContactFunction.NORMAL);
    });

    it('rejects a payload missing the required lastName (400)', async () => {
      const company = await createCompany();
      const { agent } = await loginAs();

      const { lastName, ...withoutLastName } = contactPayload(company.id);
      const res = await agent.post('/api/contact').send(withoutLastName).expect(400);
      expect(res.body).toHaveProperty('error');
    });

    it('requires an email for a NORMAL function contact (400)', async () => {
      const company = await createCompany();
      const { agent } = await loginAs();

      const { email, ...withoutEmail } = contactPayload(company.id);
      const res = await agent.post('/api/contact').send(withoutEmail).expect(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/contact/{id} (update)', () => {
    it('updates a contact (full valid body) and returns the new values', async () => {
      const company = await createCompany();
      const contact = await createContact({ companyId: company.id, lastName: 'Before' });
      const { agent } = await loginAs();

      const res = await agent
        .put(`/api/contact/${contact.id}`)
        .send(contactPayload(company.id, { lastName: 'After', firstName: 'Jane' }))
        .expect(200);

      expect(res.body.id).toBe(contact.id);
      expect(res.body.lastName).toBe('After');
      expect(res.body.firstName).toBe('Jane');
    });
  });

  describe('DELETE /api/contact/{id}', () => {
    it('deletes a contact and returns 204', async () => {
      const company = await createCompany();
      const contact = await createContact({ companyId: company.id });
      const { agent } = await loginAs();

      await agent.delete(`/api/contact/${contact.id}`).expect(204);

      await agent.get(`/api/contact/${contact.id}`).expect(404);
    });
  });

  describe('permissions', () => {
    it('rejects anonymous access to the contact table (401)', async () => {
      const anon = await anonAgent();
      await anon.post('/api/contact/table').send({}).expect(401);
    });

    it('rejects create for a user lacking GENERAL/ADMIN (401)', async () => {
      const company = await createCompany();
      const { agent } = await loginAs([Roles.SIGNEE]);

      await agent.post('/api/contact').send(contactPayload(company.id)).expect(401);
    });

    it('rejects delete for a user lacking GENERAL/ADMIN (401)', async () => {
      const company = await createCompany();
      const contact = await createContact({ companyId: company.id });
      const { agent } = await loginAs([Roles.AUDIT]);

      await agent.delete(`/api/contact/${contact.id}`).expect(401);
    });

    it('allows GENERAL to create a contact', async () => {
      const company = await createCompany();
      const { agent } = await loginAs([Roles.GENERAL]);

      await agent
        .post('/api/contact')
        .send(contactPayload(company.id, { lastName: 'GeneralMade' }))
        .expect(200);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { loginAs, anonAgent } from './agent';
import { createCompany } from './factories/company';
import { createContact } from './factories/contact';
import { Roles } from '../src/entity/enums/Roles';
import { CompanyStatus } from '../src/entity/enums/CompanyStatus';
import type { CompanyParams } from '../src/services/CompanyService';

function companyPayload(overrides: Partial<CompanyParams> = {}): CompanyParams {
  return {
    name: 'Test Company BV',
    addressStreet: 'Teststraat 1',
    addressPostalCode: '5612AZ',
    addressCity: 'Eindhoven',
    addressCountry: 'Netherlands',
    ...overrides,
  };
}

describe('CompanyController', () => {
  describe('POST /api/company/table (list)', () => {
    it('returns { list, count } and respects pagination', async () => {
      await createCompany({ name: 'Alpha Co' });
      await createCompany({ name: 'Beta Co' });
      await createCompany({ name: 'Gamma Co' });
      const { agent } = await loginAs();

      const res = await agent.post('/api/company/table').send({ skip: 0, take: 2 }).expect(200);

      expect(res.body).toHaveProperty('list');
      expect(res.body).toHaveProperty('count');
      expect(Array.isArray(res.body.list)).toBe(true);
      expect(res.body.count).toBe(3);
      expect(res.body.list).toHaveLength(2);
    });

    it('filters with a search term', async () => {
      await createCompany({ name: 'Searchable Unique Name' });
      await createCompany({ name: 'Something Else' });
      const { agent } = await loginAs();

      const res = await agent.post('/api/company/table').send({ search: 'Searchable' }).expect(200);

      expect(res.body.count).toBe(1);
      expect(res.body.list[0].name).toBe('Searchable Unique Name');
    });
  });

  describe('GET /api/company/{id}', () => {
    it('returns a single company with its relations', async () => {
      const company = await createCompany({ name: 'Get Me BV' });
      const { agent } = await loginAs();

      const res = await agent.get(`/api/company/${company.id}`).expect(200);

      expect(res.body.id).toBe(company.id);
      expect(res.body.name).toBe('Get Me BV');
      expect(Array.isArray(res.body.contacts)).toBe(true);
      expect(Array.isArray(res.body.invoices)).toBe(true);
    });

    it('returns 404 for an unknown id', async () => {
      const { agent } = await loginAs();

      const res = await agent.get('/api/company/999999').expect(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/company (create)', () => {
    it('creates a company and returns it', async () => {
      const { agent } = await loginAs();

      const res = await agent
        .post('/api/company')
        .send(companyPayload({ name: 'Created Co', status: CompanyStatus.ACTIVE }))
        .expect(200);

      expect(res.body.id).toBeGreaterThan(0);
      expect(res.body.name).toBe('Created Co');
      expect(res.body.addressCity).toBe('Eindhoven');
      expect(res.body.status).toBe(CompanyStatus.ACTIVE);
    });

    it('rejects a payload missing the required name (400)', async () => {
      const { agent } = await loginAs();

      const { name, ...withoutName } = companyPayload();
      const res = await agent.post('/api/company').send(withoutName).expect(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/company/{id} (update)', () => {
    it('updates a company (full valid body) and returns the new values', async () => {
      const company = await createCompany({ name: 'Before Name' });
      const { agent } = await loginAs();

      const res = await agent
        .put(`/api/company/${company.id}`)
        .send(companyPayload({ name: 'After Name', addressCity: 'Amsterdam' }))
        .expect(200);

      expect(res.body.id).toBe(company.id);
      expect(res.body.name).toBe('After Name');
      expect(res.body.addressCity).toBe('Amsterdam');
    });
  });

  describe('email and vatNumber', () => {
    it('persists both fields on create', async () => {
      const { agent } = await loginAs();

      const res = await agent
        .post('/api/company')
        .send(companyPayload({ email: 'info@testcompany.nl', vatNumber: 'NL123456789B01' }))
        .expect(200);

      expect(res.body.email).toBe('info@testcompany.nl');
      expect(res.body.vatNumber).toBe('NL123456789B01');
    });

    it('defaults both fields to an empty string when omitted', async () => {
      const { agent } = await loginAs();

      const res = await agent.post('/api/company').send(companyPayload()).expect(200);

      expect(res.body.email).toBe('');
      expect(res.body.vatNumber).toBe('');
    });

    it('updates both fields', async () => {
      const company = await createCompany({ email: 'old@testcompany.nl', vatNumber: 'NL123456789B01' });
      const { agent } = await loginAs();

      const res = await agent
        .put(`/api/company/${company.id}`)
        .send(companyPayload({ email: 'new@testcompany.nl', vatNumber: 'NL987654321B01' }))
        .expect(200);

      expect(res.body.email).toBe('new@testcompany.nl');
      expect(res.body.vatNumber).toBe('NL987654321B01');
    });

    it('rejects a malformed email address (400)', async () => {
      const { agent } = await loginAs();

      const res = await agent
        .post('/api/company')
        .send(companyPayload({ email: 'not-an-email' }))
        .expect(400);
      expect(res.body).toHaveProperty('error');
    });

    it('rejects a VAT number that is not Dutch (400)', async () => {
      const { agent } = await loginAs();

      const res = await agent
        .post('/api/company')
        .send(companyPayload({ vatNumber: 'DE123456789' }))
        .expect(400);
      expect(res.body).toHaveProperty('error');
    });

    it('normalizes a padded email and a spaced, lowercase VAT number', async () => {
      const { agent } = await loginAs();

      const res = await agent
        .post('/api/company')
        .send(companyPayload({ email: '  info@testcompany.nl  ', vatNumber: 'nl 123456789 b01' }))
        .expect(200);

      expect(res.body.email).toBe('info@testcompany.nl');
      expect(res.body.vatNumber).toBe('NL123456789B01');
    });
  });

  describe('DELETE /api/company/{id}', () => {
    it('deletes an empty company and returns 204', async () => {
      const company = await createCompany();
      const { agent } = await loginAs();

      await agent.delete(`/api/company/${company.id}`).expect(204);

      await agent.get(`/api/company/${company.id}`).expect(404);
    });

    it('refuses to delete a company that still has contacts (400)', async () => {
      const company = await createCompany();
      await createContact({ companyId: company.id });
      const { agent } = await loginAs();

      const res = await agent.delete(`/api/company/${company.id}`).expect(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('permissions', () => {
    it('rejects anonymous access to the company table (401)', async () => {
      const anon = await anonAgent();
      await anon.post('/api/company/table').send({}).expect(401);
    });

    it('rejects create for a user without the ADMIN role (401)', async () => {
      const { agent } = await loginAs([Roles.GENERAL]);

      await agent.post('/api/company').send(companyPayload()).expect(401);
    });

    it('allows an ADMIN to create a company', async () => {
      const { agent } = await loginAs([Roles.ADMIN]);

      await agent
        .post('/api/company')
        .send(companyPayload({ name: 'Admin Made' }))
        .expect(200);
    });

    it('rejects the table for a user lacking all required roles (401)', async () => {
      const { agent } = await loginAs([Roles.SIGNEE]);

      await agent.post('/api/company/table').send({}).expect(401);
    });
  });
});

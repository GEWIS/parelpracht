import { describe, it, expect } from 'vitest';
import { loginAs, anonAgent } from './agent';
import { createProductCategory, createProduct } from './factories/product';
import { Roles } from '../src/entity/enums/Roles';

describe('ProductCategory API', () => {
  describe('POST /api/category/table (list)', () => {
    it('lists existing categories with a count', async () => {
      await createProductCategory({ name: 'Cat List One' });
      await createProductCategory({ name: 'Cat List Two' });
      const { agent } = await loginAs();

      const res = await agent.post('/api/category/table').send({ skip: 0, take: 25 }).expect(200);

      expect(res.body.count).toBe(2);
      expect(Array.isArray(res.body.list)).toBe(true);
      const names = res.body.list.map((c: { name: string }) => c.name);
      expect(names).toContain('Cat List One');
      expect(names).toContain('Cat List Two');
    });

    it('filters by search term', async () => {
      await createProductCategory({ name: 'Searchable Widgets' });
      await createProductCategory({ name: 'Unrelated Gadgets' });
      const { agent } = await loginAs();

      const res = await agent.post('/api/category/table').send({ skip: 0, take: 25, search: 'Searchable' }).expect(200);

      expect(res.body.count).toBe(1);
      expect(res.body.list[0].name).toBe('Searchable Widgets');
    });
  });

  describe('GET /api/category/compact', () => {
    it('returns id/name summaries', async () => {
      const cat = await createProductCategory({ name: 'Compact Cat' });
      const { agent } = await loginAs();

      const res = await agent.get('/api/category/compact').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((c: { id: number }) => c.id === cat.id);
      expect(found).toBeDefined();
      expect(found.name).toBe('Compact Cat');
    });
  });

  describe('GET /api/category/{id}', () => {
    it('returns a single category with its products', async () => {
      const cat = await createProductCategory({ name: 'Cat With Products' });
      await createProduct({ categoryId: cat.id, nameDutch: 'Prod In Cat', nameEnglish: 'Prod In Cat' });
      const { agent } = await loginAs();

      const res = await agent.get(`/api/category/${cat.id}`).expect(200);

      expect(res.body.id).toBe(cat.id);
      expect(res.body.name).toBe('Cat With Products');
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products).toHaveLength(1);
      expect(res.body.products[0].nameDutch).toBe('Prod In Cat');
    });

    it('returns 404 for an unknown category', async () => {
      const { agent } = await loginAs();
      await agent.get('/api/category/999999').expect(404);
    });
  });

  describe('POST /api/category (create)', () => {
    it('creates a category', async () => {
      const { agent } = await loginAs();

      const res = await agent.post('/api/category').send({ name: 'Brand New Cat' }).expect(200);

      expect(res.body.id).toBeGreaterThan(0);
      expect(res.body.name).toBe('Brand New Cat');
    });

    it('rejects an empty name with 400', async () => {
      const { agent } = await loginAs();
      await agent.post('/api/category').send({ name: '' }).expect(400);
    });
  });

  describe('PUT /api/category/{id} (update)', () => {
    it('updates the name', async () => {
      const cat = await createProductCategory({ name: 'Before Rename' });
      const { agent } = await loginAs();

      const res = await agent.put(`/api/category/${cat.id}`).send({ name: 'After Rename' }).expect(200);

      expect(res.body.id).toBe(cat.id);
      expect(res.body.name).toBe('After Rename');
    });

    it('rejects an empty name with 400', async () => {
      const cat = await createProductCategory();
      const { agent } = await loginAs();
      await agent.put(`/api/category/${cat.id}`).send({ name: '' }).expect(400);
    });
  });

  describe('DELETE /api/category/{id}', () => {
    it('deletes an empty category (204)', async () => {
      const cat = await createProductCategory();
      const { agent } = await loginAs();

      await agent.delete(`/api/category/${cat.id}`).expect(204);
      await agent.get(`/api/category/${cat.id}`).expect(404);
    });

    it('refuses to delete a category that still has products (400)', async () => {
      const cat = await createProductCategory();
      await createProduct({ categoryId: cat.id });
      const { agent } = await loginAs();

      await agent.delete(`/api/category/${cat.id}`).expect(400);
      await agent.get(`/api/category/${cat.id}`).expect(200);
    });
  });

  describe('permissions', () => {
    it('rejects anonymous access to the table endpoint (401)', async () => {
      const anon = await anonAgent();
      await anon.post('/api/category/table').send({ skip: 0, take: 25 }).expect(401);
    });

    it('rejects anonymous create (401)', async () => {
      const anon = await anonAgent();
      await anon.post('/api/category').send({ name: 'Nope' }).expect(401);
    });

    it('forbids a non-admin from creating a category (401)', async () => {
      const { agent } = await loginAs([Roles.GENERAL]);
      await agent.post('/api/category').send({ name: 'Should Fail' }).expect(401);
    });

    it('forbids a non-admin from deleting a category (401)', async () => {
      const cat = await createProductCategory();
      const { agent } = await loginAs([Roles.GENERAL]);
      await agent.delete(`/api/category/${cat.id}`).expect(401);
    });

    it('allows a GENERAL user to list categories (200)', async () => {
      await createProductCategory();
      const { agent } = await loginAs([Roles.GENERAL]);
      await agent.post('/api/category/table').send({ skip: 0, take: 25 }).expect(200);
    });
  });
});

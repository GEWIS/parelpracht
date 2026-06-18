import { describe, it, expect } from 'vitest';
import { loginAs, anonAgent } from './agent';
import { createCompany } from './factories/company';

describe('smoke: harness + auth + factory', () => {
  it('rejects unauthenticated access', async () => {
    const anon = await anonAgent();
    await anon.get('/api/company/compact').expect(401);
  });

  it('logs in and lists a seeded company', async () => {
    await createCompany({ name: 'Acme Smoke BV' });
    const { agent } = await loginAs();

    const res = await agent.get('/api/company/compact').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.map((c: { name: string }) => c.name)).toContain('Acme Smoke BV');
  });
});

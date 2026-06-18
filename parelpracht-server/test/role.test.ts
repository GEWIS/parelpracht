import { describe, it, expect } from 'vitest';
import { loginAs, anonAgent } from './agent';
import { getDataSource } from './db';
import { Roles } from '../src/entity/enums/Roles';
import { Role } from '../src/entity/Role';

describe('RoleController: anonymous access', () => {
  it('rejects every role endpoint without a session (401)', async () => {
    const anon = await anonAgent();
    await anon.get('/api/role').expect(401);
    await anon.get(`/api/role/${Roles.ADMIN}`).expect(401);
    await anon.put(`/api/role/${Roles.ADMIN}`).send({ ldapGroup: 'x' }).expect(401);
  });
});

describe('RoleController: authorization', () => {
  it('denies a non-admin the role list (401)', async () => {
    const { agent } = await loginAs([Roles.GENERAL]);
    await agent.get('/api/role').expect(401);
  });

  it('denies a non-admin reading a single role (401)', async () => {
    const { agent } = await loginAs([Roles.FINANCIAL]);
    await agent.get(`/api/role/${Roles.ADMIN}`).expect(401);
  });

  it('denies a non-admin updating a role (401)', async () => {
    const { agent } = await loginAs([Roles.SIGNEE]);
    await agent.put(`/api/role/${Roles.ADMIN}`).send({ ldapGroup: 'x' }).expect(401);
  });
});

describe('RoleController: admin operations', () => {
  it('GET /api/role returns the five seeded roles', async () => {
    const { agent } = await loginAs([Roles.ADMIN]);

    const res = await agent.get('/api/role').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const names = res.body.map((r: Role) => r.name).sort();
    expect(names).toEqual([Roles.ADMIN, Roles.AUDIT, Roles.FINANCIAL, Roles.GENERAL, Roles.SIGNEE].sort());
  });

  it('GET /api/role/:id returns a single role', async () => {
    const { agent } = await loginAs([Roles.ADMIN]);

    const res = await agent.get(`/api/role/${Roles.FINANCIAL}`).expect(200);
    expect(res.body.name).toBe(Roles.FINANCIAL);
  });

  it('GET /api/role/:id returns 404 for an unknown role', async () => {
    const { agent } = await loginAs([Roles.ADMIN]);
    await agent.get('/api/role/NOPE').expect(404);
  });

  it('PUT /api/role/:id updates the LDAP group of a role', async () => {
    const { agent } = await loginAs([Roles.ADMIN]);

    const res = await agent
      .put(`/api/role/${Roles.GENERAL}`)
      .send({ ldapGroup: 'cn=general,dc=example,dc=org' })
      .expect(200);
    expect(res.body.ldapGroup).toBe('cn=general,dc=example,dc=org');

    const ds = await getDataSource();
    const saved = await ds.getRepository(Role).findOneBy({ name: Roles.GENERAL });
    expect(saved!.ldapGroup).toBe('cn=general,dc=example,dc=org');
  });
});

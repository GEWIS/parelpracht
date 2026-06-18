import { describe, it, expect } from 'vitest';
import { faker } from '@faker-js/faker';
import { loginAs, anonAgent } from './agent';
import { createUser } from './factories/user';
import { getDataSource } from './db';
import { Roles } from '../src/entity/enums/Roles';
import { Gender } from '../src/entity/enums/Gender';
import { User } from '../src/entity/User';

/** A valid body for POST /api/user, satisfying UserController.validateUserParams. */
function newUserBody(overrides: Record<string, unknown> = {}) {
  return {
    email: `created-${faker.string.uuid()}@example.org`,
    firstName: faker.person.firstName(),
    lastNamePreposition: '',
    lastName: faker.person.lastName(),
    function: 'Tester',
    gender: Gender.UNKNOWN,
    comment: '',
    roles: [Roles.GENERAL],
    ...overrides,
  };
}

describe('UserController: anonymous access', () => {
  it('rejects every user endpoint without a session (401)', async () => {
    const anon = await anonAgent();
    await anon.post('/api/user/table').send({}).expect(401);
    await anon.get('/api/user/compact').expect(401);
    await anon.get('/api/user/1').expect(401);
    await anon.post('/api/user').send(newUserBody()).expect(401);
    await anon.put('/api/user/1').send(newUserBody()).expect(401);
    await anon.delete('/api/user/1').expect(401);
  });
});

describe('UserController: list / read', () => {
  it('POST /api/user/table returns the paginated list and count', async () => {
    const { agent, user } = await loginAs([Roles.ADMIN]);
    await createUser({}, [Roles.GENERAL]);

    const res = await agent.post('/api/user/table').send({}).expect(200);
    expect(res.body).toHaveProperty('list');
    expect(res.body).toHaveProperty('count');
    expect(Array.isArray(res.body.list)).toBe(true);
    // The acting admin plus the extra user exist.
    expect(res.body.count).toBeGreaterThanOrEqual(2);
    expect(res.body.list.map((u: User) => u.id)).toContain(user.id);
  });

  it('GET /api/user/compact returns summaries including roles', async () => {
    const { agent, user } = await loginAs([Roles.SIGNEE]);

    const res = await agent.get('/api/user/compact').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const me = res.body.find((u: { id: number }) => u.id === user.id);
    expect(me).toBeDefined();
    expect(me.roles).toContain(Roles.SIGNEE);
  });

  it('GET /api/user/:id lets a user read their own record', async () => {
    const { agent, user } = await loginAs([Roles.GENERAL]);

    const res = await agent.get(`/api/user/${user.id}`).expect(200);
    expect(res.body.id).toBe(user.id);
  });

  it('GET /api/user/:id denies a non-admin reading another user (401)', async () => {
    const { agent } = await loginAs([Roles.GENERAL]);
    const { user: other } = await createUser({}, [Roles.GENERAL]);

    await agent.get(`/api/user/${other.id}`).expect(401);
  });

  it('GET /api/user/:id lets an admin read any user', async () => {
    const { agent } = await loginAs([Roles.ADMIN]);
    const { user: other } = await createUser({}, [Roles.GENERAL]);

    const res = await agent.get(`/api/user/${other.id}`).expect(200);
    expect(res.body.id).toBe(other.id);
  });
});

describe('UserController: create', () => {
  it('POST /api/user creates a user as admin', async () => {
    const { agent } = await loginAs([Roles.ADMIN]);
    // Create requires password + rememberMe (UserParams); update does not.
    const body = newUserBody({ password: 'Password123!', rememberMe: false });

    const res = await agent.post('/api/user').send(body).expect(200);
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.email).toBe(body.email);

    // Persisted with the requested role and a local identity.
    const ds = await getDataSource();
    const saved = await ds.getRepository(User).findOne({
      where: { id: res.body.id },
      relations: ['roles', 'identityLocal'],
    });
    expect(saved).not.toBeNull();
    expect(saved!.roles.map((r) => r.name)).toEqual([Roles.GENERAL]);
    expect(saved!.identityLocal).toBeTruthy();
  });

  it('POST /api/user is denied for a non-admin (401)', async () => {
    const { agent } = await loginAs([Roles.GENERAL]);
    await agent.post('/api/user').send(newUserBody()).expect(401);
  });

  it('POST /api/user rejects an invalid body (400)', async () => {
    const { agent } = await loginAs([Roles.ADMIN]);
    // Missing required firstName/lastName/function and a non-email email.
    await agent.post('/api/user').send({ email: 'not-an-email', roles: [] }).expect(400);
  });
});

describe('UserController: update / assign roles', () => {
  it('PUT /api/user/:id lets a user update their own profile', async () => {
    const { agent, user } = await loginAs([Roles.GENERAL]);

    const res = await agent
      .put(`/api/user/${user.id}`)
      .send(newUserBody({ email: user.email, firstName: 'Renamed', roles: [Roles.GENERAL] }))
      .expect(200);
    expect(res.body.firstName).toBe('Renamed');
  });

  it('PUT /api/user/:id ignores a user changing their own roles', async () => {
    const { agent, user } = await loginAs([Roles.GENERAL]);

    await agent
      .put(`/api/user/${user.id}`)
      .send(newUserBody({ email: user.email, roles: [Roles.ADMIN] }))
      .expect(200);

    const ds = await getDataSource();
    const saved = await ds.getRepository(User).findOne({ where: { id: user.id }, relations: ['roles'] });
    // Self role change is a no-op: still only GENERAL, never escalated to ADMIN.
    expect(saved!.roles.map((r) => r.name)).toEqual([Roles.GENERAL]);
  });

  it("PUT /api/user/:id lets an admin reassign another user's roles", async () => {
    const { agent } = await loginAs([Roles.ADMIN]);
    const { user: target } = await createUser({}, [Roles.GENERAL]);

    await agent
      .put(`/api/user/${target.id}`)
      .send(newUserBody({ email: target.email, roles: [Roles.FINANCIAL, Roles.SIGNEE] }))
      .expect(200);

    const ds = await getDataSource();
    const saved = await ds.getRepository(User).findOne({ where: { id: target.id }, relations: ['roles'] });
    expect(saved!.roles.map((r) => r.name).sort()).toEqual([Roles.FINANCIAL, Roles.SIGNEE].sort());
  });

  it('PUT /api/user/:id denies a non-admin updating another user (401)', async () => {
    const { agent } = await loginAs([Roles.GENERAL]);
    const { user: other } = await createUser({}, [Roles.GENERAL]);

    await agent
      .put(`/api/user/${other.id}`)
      .send(newUserBody({ email: other.email }))
      .expect(401);
  });
});

describe('UserController: delete', () => {
  it('DELETE /api/user/:id lets an admin soft-delete another user', async () => {
    const { agent } = await loginAs([Roles.ADMIN]);
    const { user: target } = await createUser({}, [Roles.GENERAL]);

    await agent.delete(`/api/user/${target.id}`).expect(204);

    const ds = await getDataSource();
    const stillThere = await ds.getRepository(User).findOne({ where: { id: target.id } });
    expect(stillThere).toBeNull(); // soft-deleted, excluded by default scope
  });

  it('DELETE /api/user/:id is denied for a non-admin (401)', async () => {
    const { agent } = await loginAs([Roles.GENERAL]);
    const { user: target } = await createUser({}, [Roles.GENERAL]);

    await agent.delete(`/api/user/${target.id}`).expect(401);
  });

  it('DELETE /api/user/:id rejects an admin deleting themselves (400)', async () => {
    const { agent, user } = await loginAs([Roles.ADMIN]);

    await agent.delete(`/api/user/${user.id}`).expect(400);
  });
});

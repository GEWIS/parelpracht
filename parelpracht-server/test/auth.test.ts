import { describe, it, expect } from 'vitest';
import { loginAs, anonAgent } from './agent';
import { createUser } from './factories/user';
import { getApp } from './app';
import { Roles } from '../src/entity/enums/Roles';
import request from 'supertest';

describe('authentication: POST /api/login/local', () => {
  it('logs in with correct credentials and the session works on a follow-up request', async () => {
    const { email, password } = await createUser({}, [Roles.GENERAL]);
    const agent = request.agent(await getApp());

    await agent.post('/api/login/local').send({ email, password, rememberMe: false }).expect(200);

    const res = await agent.get('/api/profile').expect(200);
    expect(res.body.email).toBe(email);
  });

  it('rejects login with a wrong password (400)', async () => {
    const { email } = await createUser({}, [Roles.GENERAL], 'Password123!');
    const anon = await anonAgent();

    await anon.post('/api/login/local').send({ email, password: 'WrongPassword123!', rememberMe: false }).expect(400);
  });

  it('rejects login for an unknown email (400)', async () => {
    const anon = await anonAgent();

    await anon
      .post('/api/login/local')
      .send({ email: 'does-not-exist@example.org', password: 'Password123!', rememberMe: false })
      .expect(400);
  });

  it('does not create a session on failed login', async () => {
    const { email } = await createUser({}, [Roles.GENERAL]);
    const agent = request.agent(await getApp());

    await agent.post('/api/login/local').send({ email, password: 'WrongPassword123!', rememberMe: false }).expect(400);

    await agent.get('/api/profile').expect(401);
  });

  it('rejects login for a user with no roles (deactivated account, 400)', async () => {
    const { email, password } = await createUser({}, []);
    const anon = await anonAgent();

    await anon.post('/api/login/local').send({ email, password, rememberMe: false }).expect(400);
  });
});

describe('authorization: protected endpoints require a session', () => {
  it('rejects an unauthenticated request to a protected endpoint (401)', async () => {
    const anon = await anonAgent();
    await anon.get('/api/profile').expect(401);
  });

  it('rejects an unauthenticated request to a role-gated endpoint (401)', async () => {
    const anon = await anonAgent();
    await anon.get('/api/user/compact').expect(401);
  });
});

describe('authorization: role enforcement', () => {
  it('denies a SIGNEE-only user an ADMIN-only endpoint (DELETE /api/user/:id) with 401', async () => {
    const { agent } = await loginAs([Roles.SIGNEE]);
    const { user: victim } = await createUser({}, [Roles.GENERAL]);

    await agent.delete(`/api/user/${victim.id}`).expect(401);
  });

  it('denies a SIGNEE-only user the ADMIN/GENERAL/AUDIT user table endpoint with 401', async () => {
    const { agent } = await loginAs([Roles.SIGNEE]);

    await agent.post('/api/user/table').send({}).expect(401);
  });

  it('denies a SIGNEE-only user the ADMIN-only role list endpoint with 401', async () => {
    const { agent } = await loginAs([Roles.SIGNEE]);

    await agent.get('/api/role').expect(401);
  });

  it('allows an ADMIN user the ADMIN-only role list endpoint (200)', async () => {
    const { agent } = await loginAs([Roles.ADMIN]);

    const res = await agent.get('/api/role').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('allows a GENERAL user the user table endpoint (200)', async () => {
    const { agent } = await loginAs([Roles.GENERAL]);

    const res = await agent.post('/api/user/table').send({}).expect(200);
    expect(res.body).toHaveProperty('list');
    expect(res.body).toHaveProperty('count');
  });

  it('allows any single role access to a role-less protected endpoint (/api/profile)', async () => {
    const { agent, user } = await loginAs([Roles.AUDIT]);

    const res = await agent.get('/api/profile').expect(200);
    expect(res.body.id).toBe(user.id);
  });
});

import { describe, it, expect } from 'vitest';
import { loginAs, anonAgent } from './agent';
import { Gender } from '../src/entity/enums/Gender';

describe('RootController endpoints', () => {
  describe('GET /api/authStatus (public)', () => {
    it('reports not authenticated for an anonymous client', async () => {
      const anon = await anonAgent();
      const res = await anon.get('/api/authStatus').expect(200);
      expect(res.body).toEqual({ authenticated: false });
    });

    it('reports authenticated for a logged-in client', async () => {
      const { agent } = await loginAs();
      const res = await agent.get('/api/authStatus').expect(200);
      expect(res.body).toEqual({ authenticated: true });
    });
  });

  describe('GET /api/getPublicGeneralInfo (public)', () => {
    it('returns the local login method and setupDone=false on a fresh DB', async () => {
      const anon = await anonAgent();
      const res = await anon.get('/api/getPublicGeneralInfo').expect(200);
      expect(res.body.loginMethod).toBe('local');
      expect(res.body.setupDone).toBe(false);
    });
  });

  describe('GET /api/getPrivateGeneralInfo (protected)', () => {
    it('returns the list of financial years for a logged-in user', async () => {
      const { agent } = await loginAs();
      const res = await agent.get('/api/getPrivateGeneralInfo').expect(200);
      expect(Array.isArray(res.body.financialYears)).toBe(true);
    });

    it('rejects anonymous access with 401', async () => {
      const anon = await anonAgent();
      await anon.get('/api/getPrivateGeneralInfo').expect(401);
    });
  });

  describe('GET /api/profile (protected)', () => {
    it('returns the currently logged-in user', async () => {
      const { agent, user } = await loginAs();
      const res = await agent.get('/api/profile').expect(200);
      expect(res.body.id).toBe(user.id);
      expect(res.body.email).toBe(user.email);
      expect(res.body.hasApiKey).toBe(false);
      expect(Array.isArray(res.body.roles)).toBe(true);
    });

    it('rejects anonymous access with 401', async () => {
      const anon = await anonAgent();
      await anon.get('/api/profile').expect(401);
    });
  });

  describe('POST /api/setup (public, one-time)', () => {
    it('performs the initial setup and flips setupDone to true', async () => {
      const anon = await anonAgent();

      const before = await anon.get('/api/getPublicGeneralInfo').expect(200);
      expect(before.body.setupDone).toBe(false);

      await anon
        .post('/api/setup')
        .send({
          admin: {
            email: 'admin@example.org',
            firstName: 'Admin',
            lastName: 'User',
            function: 'Administrator',
            gender: Gender.UNKNOWN,
            password: 'Password123!',
            rememberMe: false,
          },
        })
        .expect(204);

      const after = await anon.get('/api/getPublicGeneralInfo').expect(200);
      expect(after.body.setupDone).toBe(true);
    });

    it('refuses a second setup once the server is already set up', async () => {
      const anon = await anonAgent();
      const body = {
        admin: {
          email: 'admin@example.org',
          firstName: 'Admin',
          lastName: 'User',
          function: 'Administrator',
          gender: Gender.UNKNOWN,
          password: 'Password123!',
          rememberMe: false,
        },
      };
      await anon.post('/api/setup').send(body).expect(204);
      await anon.post('/api/setup').send(body).expect(403);
    });
  });

  describe('POST /api/logout (public)', () => {
    it('logs the current session out (204)', async () => {
      const { agent } = await loginAs();
      await agent.get('/api/authStatus').expect(200);

      await agent.post('/api/logout').expect(204);

      const res = await agent.get('/api/authStatus').expect(200);
      expect(res.body.authenticated).toBe(false);
    });
  });

  describe('POST /api/forgotPassword (public)', () => {
    it('accepts an unknown email silently (204)', async () => {
      const anon = await anonAgent();
      await anon.post('/api/forgotPassword').query({ email: 'nobody@example.org' }).expect(204);
    });
  });

  describe('POST /api/resetPassword (public)', () => {
    it('rejects a weak / mismatched password with 400', async () => {
      const anon = await anonAgent();
      await anon
        .post('/api/resetPassword')
        .send({ password: 'weak', repeatPassword: 'different', token: 'irrelevant' })
        .expect(400);
    });
  });

  describe('API key endpoints (protected)', () => {
    it('returns 400 when fetching a non-existent API key', async () => {
      const { agent } = await loginAs();
      await agent.get('/api/getApiKey').expect(400);
    });

    it('revokes (no-op) an API key the user does not have (204)', async () => {
      const { agent } = await loginAs();
      await agent.post('/api/revokeApiKey').expect(204);
    });

    it('rejects anonymous access to API key endpoints with 401', async () => {
      const anon = await anonAgent();
      await anon.get('/api/getApiKey').expect(401);
      await anon.post('/api/revokeApiKey').expect(401);
      await anon.post('/api/generateApiKey').expect(401);
    });
  });
});

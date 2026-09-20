import request from 'supertest';
import { getApp } from './app';
import { createUser, ALL_ROLES } from './factories/user';
import { Roles } from '../src/entity/enums/Roles';
import type { User } from '../src/entity/User';

export interface AuthedAgent {
  agent: ReturnType<typeof request.agent>;
  user: User;
}

export async function loginAs(roleNames: Roles[] = ALL_ROLES): Promise<AuthedAgent> {
  const app = await getApp();
  const { user, email, password } = await createUser({}, roleNames);
  const agent = request.agent(app);
  await agent.post('/api/login/local').send({ email, password, rememberMe: false }).expect(200);
  return { agent, user };
}

export async function anonAgent() {
  return request(await getApp());
}

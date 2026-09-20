import { faker } from '@faker-js/faker';
import { In } from 'typeorm';
import { getDataSource } from '../db';
import { User } from '../../src/entity/User';
import { Role } from '../../src/entity/Role';
import { IdentityLocal } from '../../src/entity/IdentityLocal';
import { Gender } from '../../src/entity/enums/Gender';
import { Roles } from '../../src/entity/enums/Roles';
import { generateSalt, hashPassword } from '../../src/auth/LocalStrategy';

export const ALL_ROLES = [Roles.ADMIN, Roles.GENERAL, Roles.FINANCIAL, Roles.SIGNEE, Roles.AUDIT];

export interface CreatedUser {
  user: User;
  email: string;
  password: string;
}

export async function createUser(
  overrides: Partial<User> = {},
  roleNames: Roles[] = ALL_ROLES,
  password = 'Password123!',
): Promise<CreatedUser> {
  const ds = await getDataSource();
  const userRepo = ds.getRepository(User);
  const roleRepo = ds.getRepository(Role);

  const roles = roleNames.length ? await roleRepo.findBy({ name: In(roleNames) }) : [];
  const email = `u-${faker.string.uuid()}@example.org`;

  const user = await userRepo.save(
    userRepo.create({
      gender: Gender.UNKNOWN,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email,
      function: 'Tester',
      roles,
      ...overrides,
    }),
  );

  const salt = generateSalt();
  await ds.getRepository(IdentityLocal).save({
    id: user.id,
    verifiedEmail: true,
    salt,
    hash: hashPassword(password, salt),
  });

  return { user, email: user.email, password };
}

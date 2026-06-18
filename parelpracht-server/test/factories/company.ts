import { faker } from '@faker-js/faker';
import { getDataSource } from '../db';
import { Company } from '../../src/entity/Company';

export async function createCompany(overrides: Partial<Company> = {}): Promise<Company> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Company);
  return repo.save(
    repo.create({
      name: faker.company.name(),
      addressStreet: faker.location.streetAddress(),
      addressPostalCode: faker.location.zipCode(),
      addressCity: faker.location.city(),
      addressCountry: 'Netherlands',
      ...overrides,
    }),
  );
}

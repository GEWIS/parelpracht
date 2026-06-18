import { faker } from '@faker-js/faker';
import { getDataSource } from '../db';
import { Contact } from '../../src/entity/Contact';
import { Company } from '../../src/entity/Company';
import { Gender } from '../../src/entity/enums/Gender';
import { ContactFunction } from '../../src/entity/enums/ContactFunction';
import { createCompany } from './company';

/**
 * Create a persisted contact. A contact requires a company: pass one via
 * `overrides.company`/`overrides.companyId`, otherwise a fresh company is created.
 */
export async function createContact(overrides: Partial<Contact> = {}): Promise<Contact> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Contact);

  let { companyId } = overrides;
  if (companyId === undefined) {
    const company = overrides.company ?? (await createCompany());
    companyId = company.id;
  }

  // company is a relation we resolve via companyId; drop it from the column overrides.
  const { company: _company, companyId: _companyId, ...rest } = overrides as Partial<Contact> & { company?: Company };

  return repo.save(
    repo.create({
      gender: Gender.MALE,
      firstName: faker.person.firstName(),
      lastNamePreposition: '',
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
      function: ContactFunction.NORMAL,
      companyId,
      ...rest,
    }),
  );
}

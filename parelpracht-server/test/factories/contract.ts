import { faker } from '@faker-js/faker';
import type { Company } from '../../src/entity/Company';
import type { Contact } from '../../src/entity/Contact';
import type { User } from '../../src/entity/User';
import { getDataSource } from '../db';
import { Contract } from '../../src/entity/Contract';
import { ProductInstance } from '../../src/entity/ProductInstance';
import { Roles } from '../../src/entity/enums/Roles';
import { createCompany } from './company';
import { createContact } from './contact';
import { createProduct } from './product';
import { createUser } from './user';

export interface CreatedContract {
  contract: Contract;
  company: Company;
  contact: Contact;
  user: User;
}

export interface CreateContractOptions {
  company?: Company;
  contact?: Contact;
  assignedTo?: User;
  createdBy?: User;
  overrides?: Partial<Contract>;
}

export async function createContract(options: CreateContractOptions = {}): Promise<CreatedContract> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Contract);

  const company = options.company ?? (await createCompany());
  const contact = options.contact ?? (await createContact({ companyId: company.id }));

  const user = options.createdBy ?? options.assignedTo ?? (await createUser({}, [Roles.GENERAL])).user;
  const assignedToId = options.assignedTo?.id ?? user.id;

  const contract = await repo.save(
    repo.create({
      title: faker.commerce.productName(),
      companyId: company.id,
      contactId: contact.id,
      comments: '',
      assignedToId,
      createdById: user.id,
      ...options.overrides,
    }),
  );

  return { contract, company, contact, user };
}

export async function addProductInstance(
  contractId: number,
  overrides: Partial<ProductInstance> = {},
): Promise<ProductInstance> {
  const ds = await getDataSource();
  const repo = ds.getRepository(ProductInstance);

  const productId = overrides.productId ?? (await createProduct()).id;

  return repo.save(
    repo.create({
      basePrice: 50000,
      discount: 0,
      details: '',
      ...overrides,
      productId,
      contractId,
    }),
  );
}

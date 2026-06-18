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
  /** The user recorded as createdBy / assignedTo of the contract. */
  user: User;
}

export interface CreateContractOptions {
  /** Use this company instead of creating a fresh one. */
  company?: Company;
  /** Use this contact instead of creating a fresh one (must belong to the company). */
  contact?: Contact;
  /** The user this contract is assigned to. */
  assignedTo?: User;
  /** The user that created this contract. Defaults to `assignedTo` when given. */
  createdBy?: User;
  /** Extra column overrides for the contract row. */
  overrides?: Partial<Contract>;
}

/**
 * Persist a Contract together with its required Company + Contact. This writes
 * straight to the database (bypassing the controller), so it does NOT create the
 * CREATED status activity that the create endpoint produces. That makes the
 * resulting contract safely deletable in tests.
 *
 * `createdById` is non-nullable on the Contract, so a user is always created
 * unless `createdBy` (or `assignedTo`) is supplied. The contact is created
 * belonging to the contract's company, satisfying the company/contact link.
 */
export async function createContract(options: CreateContractOptions = {}): Promise<CreatedContract> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Contract);

  const company = options.company ?? (await createCompany());
  const contact = options.contact ?? (await createContact({ companyId: company.id }));

  // A contract must have a creator. Reuse an explicit user, otherwise mint one.
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

/**
 * Persist a ProductInstance directly on a contract (bypassing the controller, so
 * no status activities are created). Creates a Product if none is supplied.
 * `basePrice` and `discount` are in cents.
 */
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

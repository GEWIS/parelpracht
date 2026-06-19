import { faker } from '@faker-js/faker';
import { getDataSource } from '../db';
import { createCompany } from './company';
import { createUser } from './user';
import { Company } from '../../src/entity/Company';
import { Contact } from '../../src/entity/Contact';
import { Contract } from '../../src/entity/Contract';
import { Invoice } from '../../src/entity/Invoice';
import { Product } from '../../src/entity/Product';
import { ProductCategory } from '../../src/entity/ProductCategory';
import { ProductInstance } from '../../src/entity/ProductInstance';
import { ValueAddedTax } from '../../src/entity/ValueAddedTax';
import { InvoiceActivity } from '../../src/entity/activity/InvoiceActivity';
import { ActivityType } from '../../src/entity/enums/ActivityType';
import { InvoiceStatus } from '../../src/entity/enums/InvoiceStatus';
import { VAT } from '../../src/entity/enums/ValueAddedTax';
import ActivityService from '../../src/services/ActivityService';
import type { FullActivityParams } from '../../src/services/ActivityService';
import type { User } from '../../src/entity/User';

/** Default VAT amounts (stored * 100, i.e. 21% -> 2100). */
const VAT_AMOUNTS: Record<VAT, number> = {
  [VAT.ZERO]: 0,
  [VAT.LOW]: 900,
  [VAT.HIGH]: 2100,
};

/** Find-or-create a ValueAddedTax row for the given category. */
export async function createVat(category: VAT = VAT.HIGH): Promise<ValueAddedTax> {
  const ds = await getDataSource();
  const repo = ds.getRepository(ValueAddedTax);
  const existing = await repo.findOneBy({ category });
  if (existing) return existing;
  return repo.save(repo.create({ category, amount: VAT_AMOUNTS[category] }));
}

/** Find-or-create a single shared product category. */
async function createProductCategory(): Promise<ProductCategory> {
  const ds = await getDataSource();
  const repo = ds.getRepository(ProductCategory);
  const existing = await repo.findOne({ where: {}, order: { id: 'ASC' } });
  if (existing) return existing;
  return repo.save(repo.create({ name: faker.commerce.department() }));
}

/** Create a persisted Product (defaults to the HIGH VAT category). */
export async function createProduct(overrides: Partial<Product> = {}, vatCategory: VAT = VAT.HIGH): Promise<Product> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Product);
  const vat = await createVat(vatCategory);
  const category = await createProductCategory();
  return repo.save(
    repo.create({
      nameDutch: faker.commerce.productName(),
      nameEnglish: faker.commerce.productName(),
      targetPrice: 100000,
      description: faker.commerce.productDescription(),
      contractTextDutch: 'Contracttekst',
      contractTextEnglish: 'Contract text',
      vatId: vat.id,
      categoryId: category.id,
      ...overrides,
    }),
  );
}

/** Create a Contact for a company (Contract requires a contact). */
async function createContact(company: Company): Promise<Contact> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Contact);
  return repo.save(
    repo.create({
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      companyId: company.id,
    }),
  );
}

/** Create a Contract for a company (a ProductInstance must hang off a contract). */
export async function createContract(company: Company, createdBy: User): Promise<Contract> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Contract);
  const contact = await createContact(company);
  return repo.save(
    repo.create({
      title: faker.commerce.productName(),
      companyId: company.id,
      contactId: contact.id,
      createdById: createdBy.id,
      assignedToId: createdBy.id,
    }),
  );
}

export interface CreateProductInstanceOptions {
  company: Company;
  createdBy: User;
  contract?: Contract;
  basePrice?: number;
  discount?: number;
  vatCategory?: VAT;
}

/**
 * Create a ProductInstance not yet attached to any invoice. The instance hangs
 * off a contract of the given company so it is eligible to be invoiced for that
 * company.
 */
export async function createProductInstance(opts: CreateProductInstanceOptions): Promise<ProductInstance> {
  const ds = await getDataSource();
  const repo = ds.getRepository(ProductInstance);
  const contract = opts.contract ?? (await createContract(opts.company, opts.createdBy));
  const product = await createProduct({}, opts.vatCategory ?? VAT.HIGH);
  return repo.save(
    repo.create({
      productId: product.id,
      contractId: contract.id,
      basePrice: opts.basePrice ?? 100000,
      discount: opts.discount ?? 0,
      invoiceId: null,
    }),
  );
}

export interface CreateInvoiceOptions {
  company?: Company;
  createdBy?: User;
  /**
   * How many ProductInstances to create and attach to the invoice. Defaults to
   * 0 so the invoice is deletable (delete is blocked when it has products).
   */
  productCount?: number;
  /** Price (excl. VAT) of every created product instance. */
  basePrice?: number;
  /** Discount applied to every created product instance. */
  discount?: number;
  /** VAT category of the created products. */
  vatCategory?: VAT;
  overrides?: Partial<Invoice>;
}

export interface CreatedInvoice {
  invoice: Invoice;
  company: Company;
  createdBy: User;
  products: ProductInstance[];
}

/**
 * Create a fully persisted invoice: a company, a creating user, a CREATED status
 * activity (so it shows up in summary/compact/expired queries), and optionally a
 * number of attached product instances.
 *
 * Product instances are linked by setting `invoiceId` explicitly (the
 * Invoice.products OneToMany has no cascade, so saving the parent does not
 * persist the child FK).
 */
export async function createInvoice(opts: CreateInvoiceOptions = {}): Promise<CreatedInvoice> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Invoice);

  const company = opts.company ?? (await createCompany());
  const createdBy = opts.createdBy ?? (await createUser()).user;

  let invoice = await repo.save(
    repo.create({
      title: faker.commerce.productName(),
      companyId: company.id,
      createdById: createdBy.id,
      assignedToId: createdBy.id,
      startDate: new Date(),
      ...opts.overrides,
    }),
  );

  // CREATED status activity, mirroring InvoiceService.createInvoice. Required for
  // the invoice to appear in the raw-query summary/compact/expired endpoints.
  await new ActivityService(new InvoiceActivity(), { actor: createdBy }).createActivity(InvoiceActivity, {
    entityId: invoice.id,
    type: ActivityType.STATUS,
    subType: InvoiceStatus.CREATED,
    descriptionDutch: '',
    descriptionEnglish: '',
  } as FullActivityParams);

  const products: ProductInstance[] = [];
  const count = opts.productCount ?? 0;
  for (let i = 0; i < count; i += 1) {
    const instance = await createProductInstance({
      company,
      createdBy,
      basePrice: opts.basePrice,
      discount: opts.discount,
      vatCategory: opts.vatCategory,
    });
    instance.invoiceId = invoice.id;
    products.push(await ds.getRepository(ProductInstance).save(instance));
  }

  invoice = (await repo.findOne({ where: { id: invoice.id }, relations: ['products', 'activities', 'company'] }))!;

  return { invoice, company, createdBy, products };
}

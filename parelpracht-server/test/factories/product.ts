import { faker } from '@faker-js/faker';
import { getDataSource } from '../db';
import { Product } from '../../src/entity/Product';
import { ProductCategory } from '../../src/entity/ProductCategory';
import { ProductPricing } from '../../src/entity/ProductPricing';
import { ValueAddedTax } from '../../src/entity/ValueAddedTax';
import { ProductStatus } from '../../src/entity/enums/ProductStatus';
import { VAT } from '../../src/entity/enums/ValueAddedTax';

export async function createProductCategory(overrides: Partial<ProductCategory> = {}): Promise<ProductCategory> {
  const ds = await getDataSource();
  const repo = ds.getRepository(ProductCategory);
  return repo.save(
    repo.create({
      name: `${faker.commerce.department()} ${faker.string.alphanumeric(6)}`,
      ...overrides,
    }),
  );
}

export async function createValueAddedTax(overrides: Partial<ValueAddedTax> = {}): Promise<ValueAddedTax> {
  const ds = await getDataSource();
  const repo = ds.getRepository(ValueAddedTax);
  return repo.save(
    repo.create({
      category: VAT.HIGH,
      amount: 2100,
      ...overrides,
    }),
  );
}

export async function createProduct(overrides: Partial<Product> = {}): Promise<Product> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Product);

  const categoryId = overrides.categoryId ?? (await createProductCategory()).id;
  const vatId = overrides.vatId ?? (await createValueAddedTax()).id;

  return repo.save(
    repo.create({
      nameDutch: `${faker.commerce.productName()} (NL)`,
      nameEnglish: `${faker.commerce.productName()} (EN)`,
      targetPrice: faker.number.int({ min: 1000, max: 1_000_000 }),
      status: ProductStatus.ACTIVE,
      description: faker.commerce.productDescription(),
      contractTextDutch: faker.lorem.sentence(),
      contractTextEnglish: faker.lorem.sentence(),
      deliverySpecificationDutch: faker.lorem.sentence(),
      deliverySpecificationEnglish: faker.lorem.sentence(),
      ...overrides,
      categoryId,
      vatId,
    }),
  );
}

export async function createProductPricing(
  productId: number,
  overrides: Partial<ProductPricing> = {},
): Promise<ProductPricing> {
  const ds = await getDataSource();
  const repo = ds.getRepository(ProductPricing);
  return repo.save(
    repo.create({
      id: productId,
      description: faker.lorem.sentence(),
      data: [['Header'], [faker.commerce.price()]],
      ...overrides,
    }),
  );
}

import { getDataSource } from '../db';
import { ValueAddedTax } from '../../src/entity/ValueAddedTax';
import { VAT } from '../../src/entity/enums/ValueAddedTax';

/**
 * Create a persisted ValueAddedTax row. `amount` is stored as an integer
 * (price * 100), e.g. 2100 = 21%.
 */
export async function createVAT(overrides: Partial<ValueAddedTax> = {}): Promise<ValueAddedTax> {
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

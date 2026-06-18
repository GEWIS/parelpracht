import type { DataSource } from 'typeorm';

let ds: DataSource | undefined;

/** The shared, initialised test data source (the app's global AppDataSource). */
export async function getDataSource(): Promise<DataSource> {
  if (!ds) {
    ds = (await import('../src/database')).default;
  }
  if (!ds.isInitialized) {
    await ds.initialize();
  }
  return ds;
}

/** Initialise the DB and seed the role rows the app expects. */
export async function initTestDb(): Promise<DataSource> {
  const dataSource = await getDataSource();
  const { default: UserService } = await import('../src/services/UserService');
  await new UserService().setupRoles();
  return dataSource;
}

/** Wipe every table, then recreate the role rows (auth needs them). */
export async function resetDb(): Promise<void> {
  const dataSource = await getDataSource();
  const rows: { t: string }[] = await dataSource.query(
    'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { t } of rows) {
    await dataSource.query(`TRUNCATE TABLE \`${t}\``);
  }
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');

  const { default: UserService } = await import('../src/services/UserService');
  await new UserService().setupRoles();
}

export async function destroyTestDb(): Promise<void> {
  if (ds?.isInitialized) {
    await ds.destroy();
  }
}

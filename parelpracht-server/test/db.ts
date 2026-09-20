import type { DataSource } from 'typeorm';

let ds: DataSource | undefined;

export async function getDataSource(): Promise<DataSource> {
  if (!ds) {
    ds = (await import('../src/database')).default;
  }
  if (!ds.isInitialized) {
    await ds.initialize();
  }
  return ds;
}

export async function initTestDb(): Promise<DataSource> {
  const dataSource = await getDataSource();
  const { default: UserService } = await import('../src/services/UserService');
  await new UserService().setupRoles();
  return dataSource;
}

let tableNames: string[] | undefined;

async function getTableNames(dataSource: DataSource): Promise<string[]> {
  if (!tableNames) {
    const rows: { t: string }[] = await dataSource.query(
      'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    tableNames = rows.map(({ t }) => t);
  }
  return tableNames;
}

export async function resetDb(): Promise<void> {
  const dataSource = await getDataSource();
  const tables = await getTableNames(dataSource);

  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of tables) {
    await dataSource.query(`DELETE FROM \`${table}\``);
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

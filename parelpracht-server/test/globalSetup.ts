import fs from 'fs';
import path from 'path';
import { MariaDbContainer, StartedMariaDbContainer } from '@testcontainers/mariadb';

const CONFIG_PATH = path.join(process.cwd(), 'test', '.db-config.json');

// Runs once before the whole test run: start a throwaway MariaDB and write its
// connection params where the per-worker setup file can read them.
export default async function globalSetup() {
  const container: StartedMariaDbContainer = await new MariaDbContainer('mariadb:11')
    .withDatabase('parelpracht_test')
    .withUsername('test')
    .withUserPassword('test')
    .start();

  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      username: container.getUsername(),
      password: container.getUserPassword(),
    }),
  );

  return async () => {
    await container.stop();
    fs.rmSync(CONFIG_PATH, { force: true });
  };
}

import fs from 'fs';
import path from 'path';
import { MariaDbContainer, StartedMariaDbContainer } from '@testcontainers/mariadb';

const CONFIG_PATH = path.join(process.cwd(), 'test', '.db-config.json');

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

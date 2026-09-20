import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { beforeAll, beforeEach } from 'vitest';

const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test', '.db-config.json'), 'utf8'));
process.env.NODE_ENV = 'test';
process.env.TYPEORM_CONNECTION = 'mariadb';
process.env.TYPEORM_HOST = cfg.host;
process.env.TYPEORM_PORT = String(cfg.port);
process.env.TYPEORM_DATABASE = cfg.database;
process.env.TYPEORM_USERNAME = cfg.username;
process.env.TYPEORM_PASSWORD = cfg.password;
process.env.TYPEORM_SYNCHRONIZE = 'true';
process.env.TYPEORM_LOGGING = 'false';
process.env.TYPEORM_SUBSCRIBERS = path.join(process.cwd(), 'src', '__none__', '**', '*.ts');
process.env.TYPEORM_MIGRATIONS = path.join(process.cwd(), 'src', '__none__', '**', '*.ts');
process.env.SESSION_SECRET = 'test-secret';

beforeAll(async () => {
  const { initTestDb } = await import('./db');
  await initTestDb();
});

beforeEach(async () => {
  const { resetDb } = await import('./db');
  await resetDb();
});

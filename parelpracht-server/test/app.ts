import type { Express } from 'express';
import { getDataSource } from './db';

let appInstance: Express | undefined;

export async function getApp(): Promise<Express> {
  if (!appInstance) {
    const dataSource = await getDataSource();
    const { createApp } = await import('../src/index');
    appInstance = createApp(dataSource);
  }
  return appInstance;
}

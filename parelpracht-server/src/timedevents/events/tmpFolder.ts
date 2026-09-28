import * as fs from 'fs';
import path from 'path';
import { rimraf } from 'rimraf';
import { appRoot, workDirLoc } from '../../helpers/fileHelper';

export default async function tmpFolder() {
  const tmpDir = path.join(appRoot, workDirLoc);
  console.warn('Remove temp folder...');
  await rimraf(tmpDir);
  console.warn('Folder deleted');
  fs.mkdirSync(tmpDir);
  console.warn('Removed and recreated a new "tmp" folder for temporary files');
}

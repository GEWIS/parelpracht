import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// TypeORM + tsoa rely on decorator metadata, which esbuild (vitest's default)
// does not emit. unplugin-swc transforms with `decoratorMetadata` so entities work.
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        keepClassNames: true,
        target: 'es2022',
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    // One MariaDB container shared across files; run serially so the per-test
    // truncate doesn't race between files.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000, // container pull/start + schema sync
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // Build artefacts, the tsoa-generated spec, and the bin entrypoint.
      exclude: ['src/build/**', 'src/public/**'],
      reporter: ['text', 'html'],
    },
  },
});

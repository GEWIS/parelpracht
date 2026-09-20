import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

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
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    isolate: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/build/**', 'src/public/**'],
      reporter: ['text', 'html'],
    },
  },
});

import { eslintConfig as common } from '@gewis/eslint-config-typescript';
import { eslintConfig as prettier } from '@gewis/prettier-config';

export default [
  ...common,
  prettier,
  // Integration tests: supertest response bodies are typed `any`, so the
  // no-unsafe-* family is pure noise here. Everything else (import/order,
  // no-floating-promises, ...) stays on. Flat-config later entries win, so
  // this overrides the shared config for test/ only.
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      // Import order is load-bearing here: a test must import its ./db / ./agent
      // helpers (which set up the TypeORM data source and full entity graph)
      // before any standalone `../src/entity/*` class, or the entity's decorators
      // register early and corrupt the synchronize'd schema. import/order wants
      // the opposite (parent before sibling), so it's off for tests.
      'import/order': 'off',
      // Allow the `const { x, ...rest } = obj` omit pattern used to build
      // invalid request bodies.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
    },
  },
];

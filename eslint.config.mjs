import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default defineConfig([
  {
    // TypeScript files (typings + compile-time checks) are validated by tsc
    // (`npm run check-types`), not by ESLint.
    ignores: ['node_modules/', 'coverage/', '**/*.ts'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2024,
      globals: globals.node,
    },
    rules: {
      curly: 'error',
      eqeqeq: 'error',
      'no-console': 'warn',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',
      'no-else-return': 'error',
      'object-shorthand': 'error',
      'no-shadow': 'error',
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  {
    files: ['test/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
  prettier,
]);

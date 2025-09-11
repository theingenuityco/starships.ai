import { sharedConfig } from '../../eslint.config.mjs';
import globals from 'globals';

export default [
  ...sharedConfig,
  {
    // Add Jest globals to test setup files
    files: ['**/tests/setup.ts', '**/tests/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
];

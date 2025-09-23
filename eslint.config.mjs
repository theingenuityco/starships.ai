import typescriptEslint from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import js from '@eslint/js';

export const sharedConfig = [
  {
    ignores: ['**/dist', '**/node_modules'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },

    languageOptions: {
      globals: {
        ...globals.node,
        RequestInit: true,
      },

      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
    },

    rules: {
      ...typescriptEslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
    },
  },
  {
    // Add Jest globals to tests and __tests__ files
    files: ['**/{tests,__tests__}/setup.ts', '**/{tests,__tests__}/**/*.ts', '**/*.{spec,test}.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];

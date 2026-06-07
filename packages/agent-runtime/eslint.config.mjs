import { sharedConfig } from '../../eslint.config.mjs';

export default [
  ...sharedConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
];

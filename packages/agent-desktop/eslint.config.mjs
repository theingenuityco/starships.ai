import { sharedConfig } from '../../eslint.config.mjs';

export default [
  ...sharedConfig,
  {
    files: ['**/*.tsx'],
    rules: {},
  },
];

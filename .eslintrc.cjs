module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ],
  env: {
    node: true,
    es2020: true,
  },
  overrides: [
    {
      files: ['**/*.spec.ts', '**/*.test.ts'],
      env: { jest: true },
    },
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    // Customize or override rules here
  },
}; 
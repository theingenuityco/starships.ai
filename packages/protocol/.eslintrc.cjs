module.exports = {
  // Extend the root ESLint configuration
  extends: ['../../.eslintrc.cjs'],
  
  // Override specific rules for the protocol package
  rules: {
    // Make these rules errors instead of warnings
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
  },
};
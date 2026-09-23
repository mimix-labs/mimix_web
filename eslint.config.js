import js from '@eslint/js'
import globals from 'globals'

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'client/public/challenges/**/vendor/**',
      'graphify-out/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['server/**/*.js', 'test/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['client/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        io: 'readonly',
        THREE: 'readonly',
      },
    },
  },
  {
    files: ['client/public/**/*.js'],
    rules: {
      // The current challenges are classic browser scripts with known legacy
      // patterns. Keep syntax/no-undef coverage without turning this baseline
      // PR into a product refactor.
      'no-case-declarations': 'off',
      'no-dupe-class-members': 'off',
      'no-useless-assignment': 'off',
    },
  },
  {
    rules: {
      // Legacy scripts carry intentionally dormant helpers. This becomes an
      // error once the challenge packages are migrated and can be cleaned.
      'no-unused-vars': 'off',
    },
  },
]

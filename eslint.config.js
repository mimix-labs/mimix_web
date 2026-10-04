import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

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
  ...tseslint.configs.recommended.map(config => ({ ...config, files: ['apps/api/**/*.ts', 'server/src/*.d.ts', 'packages/**/*.ts'] })),
  { files: ['apps/api/**/*.{ts,js}', 'packages/**/*.{ts,js}'], languageOptions: { globals: globals.node } },
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
    files: ['**/*.js'],
    rules: {
      // Legacy scripts carry intentionally dormant helpers. This becomes an
      // error once the challenge packages are migrated and can be cleaned.
      'no-unused-vars': 'off',
    },
  },
]

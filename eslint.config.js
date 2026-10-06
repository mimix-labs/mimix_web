import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/node_modules/**',
      'client/public/challenges/**/vendor/**',
      'graphify-out/**',
      '**/harness-dist/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended.map(config => ({ ...config, files: ['apps/api/**/*.ts', 'apps/web/**/*.{ts,tsx}', 'server/src/*.d.ts', 'packages/**/*.ts', 'characters/**/*.ts', 'tools/**/*.ts'] })),
  { files: ['apps/api/**/*.{ts,js}', 'apps/web/**/*.{ts,tsx,js,mjs}', 'packages/**/*.{ts,js}', 'characters/**/*.{ts,js}', 'tools/**/*.{ts,js}', 'client/test/**/*.js'], languageOptions: { globals: globals.node } },
  { files: ['packages/challenge-{browser,mathematics,science}/src/*.js'], languageOptions: { globals: globals.browser } },
  {
    files: ['server/**/*.js', 'test/**/*.js', 'infra/docker/*.cjs', '*.js'],
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

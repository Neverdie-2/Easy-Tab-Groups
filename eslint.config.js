import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config. The authoritative zero-network gate is
 * `scripts/no-network-guard.mjs` (it also scans the built bundle); the rules
 * below are defense-in-depth inside the editor/CI lint step.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '**/*.d.ts',
      'public/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'Zero-network: fetch is banned in runtime source.',
        },
        {
          name: 'XMLHttpRequest',
          message: 'Zero-network: XMLHttpRequest is banned.',
        },
        { name: 'WebSocket', message: 'Zero-network: WebSocket is banned.' },
        {
          name: 'EventSource',
          message: 'Zero-network: EventSource is banned.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message: 'Zero-network: fetch() is banned in runtime source.',
        },
        {
          selector: "NewExpression[callee.name='XMLHttpRequest']",
          message: 'Zero-network: XMLHttpRequest is banned in runtime source.',
        },
        {
          selector: "NewExpression[callee.name='WebSocket']",
          message: 'Zero-network: WebSocket is banned in runtime source.',
        },
        {
          selector: "NewExpression[callee.name='EventSource']",
          message: 'Zero-network: EventSource is banned in runtime source.',
        },
        {
          selector: "MemberExpression[property.name='sendBeacon']",
          message:
            'Zero-network: navigator.sendBeacon is banned in runtime source.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);

import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'docs', 'public'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // The client bundle must never pull in server-only code (email, Notion,
    // Admin SDK helpers). Anything under server/ is off limits to src/.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/**', '**/server'],
              message: 'src/ must not import from server/. Move shared code to src/lib.',
            },
          ],
        },
      ],
    },
  },
  {
    // Node-side code and one-off scripts print their results on purpose.
    files: ['server.ts', 'scripts/**', 'test/**'],
    rules: { 'no-console': 'off' },
  }
);

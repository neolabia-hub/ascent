// NEO PULSE — ESLint 9 flat config (raiz del monorepo). Aplica a api (NestJS), web (Next) y shared.
// Fuente unica de reglas; cada paquete corre `eslint .` y encuentra esta config al subir el arbol.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      // Segunda carpeta de build: la del stack de mirar (scripts/mirar.ps1). Generada, no se revisa.
      '**/.next-mirar/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'apps/api/prisma/migrations/**',
    ],
  },

  // Base TypeScript (api + shared + web).
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Frontend Next.js: globals de browser + reglas de Next y de React Hooks.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },

  // Tests (Jest): globals del runner.
  {
    files: ['apps/api/test/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
);

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Mensagens da regra de dependência (docs/ARQUITETURA.md).
// `pages → domain → core`: import que sobe essa seta reprova o lint.
const CORE_SEM_NEGOCIO = 'core é infraestrutura: não pode conhecer domain nem pages. Inverta a dependência (receba por parâmetro).'
const DOMAIN_SEM_TELA = 'domain não conhece tela. Se a página precisa disso, exponha pelo store/use-case.'
const PAGES_SEM_HTTP = 'pages não falam HTTP. Use o store do domínio (src/domain/<nome>/<nome>.store.ts).'
const FRONT_SEM_BACK = 'código de servidor NUNCA entra no bundle do frontend (vazaria Prisma e segredos). Compartilhe só tipos, por src/domain/shared.'
const BACK_SEM_FRONT = 'o backend não importa do frontend. Tipo compartilhado vai em server/domain/shared.'

// Nunca no frontend: puxariam o servidor para dentro do bundle
const BACKEND_ONLY = [
  { name: '@prisma/client', message: FRONT_SEM_BACK },
  { name: 'fastify', message: FRONT_SEM_BACK },
  { name: 'pino', message: FRONT_SEM_BACK },
]

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },

  // --- Backend: core não conhece negócio ---
  {
    files: ['server/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/domain/**'], message: CORE_SEM_NEGOCIO },
          { group: ['**/src/**'], message: BACK_SEM_FRONT },
        ],
      }],
    },
  },

  // --- Backend: domain não conhece tela ---
  {
    files: ['server/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/pages/**', '**/src/**'], message: BACK_SEM_FRONT },
        ],
      }],
    },
  },

  // --- Frontend: core não conhece negócio nem servidor ---
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: BACKEND_ONLY,
        patterns: [
          { group: ['**/domain/**', '**/pages/**'], message: CORE_SEM_NEGOCIO },
          { group: ['**/server/**'], message: FRONT_SEM_BACK },
        ],
      }],
    },
  },

  // --- Frontend: domain não conhece tela nem servidor ---
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: BACKEND_ONLY,
        patterns: [
          { group: ['**/pages/**'], message: DOMAIN_SEM_TELA },
          { group: ['**/server/**'], message: FRONT_SEM_BACK },
        ],
      }],
    },
  },

  // --- Frontend: pages não falam HTTP nem tocam o servidor ---
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          ...BACKEND_ONLY,
          { name: 'axios', message: PAGES_SEM_HTTP },
          { name: '@tanstack/react-query', message: PAGES_SEM_HTTP },
        ],
        patterns: [
          { group: ['**/core/api/**'], message: PAGES_SEM_HTTP },
          { group: ['**/server/**'], message: FRONT_SEM_BACK },
        ],
      }],
    },
  },
])

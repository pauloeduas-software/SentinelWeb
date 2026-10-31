import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Mensagens da regra de dependência (docs/referencia/arquitetura.md).
// Servidor: `modules → infra`. Front: `pages → queries → api`. Import que sobe
// a seta reprova o lint.
const INFRA_SEM_NEGOCIO = 'infra é infraestrutura: não pode conhecer modules nem tela. Inverta a dependência (receba por parâmetro).'
const API_SEM_NEGOCIO = 'api é só o cliente HTTP: não conhece queries, stores, types nem tela. Inverta a dependência (receba por parâmetro).'
const QUERIES_SEM_TELA = 'queries, stores e types não conhecem tela. Se a página precisa disso, exponha pela query ou pelo store.'
const PAGES_SEM_HTTP = 'tela não fala HTTP. Use as queries (src/queries/<nome>.queries.ts).'
const FRONT_SEM_BACK = 'código de servidor NUNCA entra no bundle do frontend (vazaria Prisma e segredos). Compartilhe só tipos, por src/types.'
const BACK_SEM_FRONT = 'o backend não importa do frontend. Tipo compartilhado vai em server/modules/shared.'

// Nunca no frontend: puxariam o servidor para dentro do bundle
const BACKEND_ONLY = [
  { name: '@prisma/client', message: FRONT_SEM_BACK },
  { name: 'fastify', message: FRONT_SEM_BACK },
  { name: 'pino', message: FRONT_SEM_BACK },
]

// Sem cor fixa no frontend: a cor mora nos tokens de src/index.css, e nenhum
// registro ganha cor pelo valor (status, nome, categoria, tipo de evento). A
// regra pega a paleta numerada do Tailwind (`bg-red-500`), hex e rgb/hsl em
// string e template; o que passa é token (`text-status-danger`, `bg-bg-base`).
const COR_FIXA = 'sem cor fixa no frontend: use um token do tema (src/index.css), como bg-bg-base, text-status-danger ou border-border-sutil.'
const PALETA_TAILWIND = '/\\b(bg|text|border|ring|outline|fill|stroke|divide|from|via|to|shadow|accent|caret|decoration)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]{2,3}\\b/'
const COR_CSS = '/#[0-9a-fA-F]{6}\\b|#[0-9a-fA-F]{3}\\b|\\b(rgb|hsl)a?\\(/'
const SEM_COR_FIXA = [
  { selector: `Literal[value=${PALETA_TAILWIND}]`, message: COR_FIXA },
  { selector: `TemplateElement[value.raw=${PALETA_TAILWIND}]`, message: COR_FIXA },
  { selector: `Literal[value=${COR_CSS}]`, message: COR_FIXA },
  { selector: `TemplateElement[value.raw=${COR_CSS}]`, message: COR_FIXA },
]

// A camada de tela do front: as páginas e o que elas compartilham.
const TELA = ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}', 'src/helpers/**/*.{ts,tsx}']

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

  // --- Backend: infra não conhece negócio ---
  {
    files: ['server/infra/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/modules/**'], message: INFRA_SEM_NEGOCIO },
          { group: ['**/src/**'], message: BACK_SEM_FRONT },
        ],
      }],
    },
  },

  // --- Backend: modules não conhecem tela ---
  {
    files: ['server/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/pages/**', '**/src/**'], message: BACK_SEM_FRONT },
        ],
      }],
    },
  },

  // --- Frontend: api não conhece negócio nem servidor ---
  {
    files: ['src/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: BACKEND_ONLY,
        patterns: [
          { group: ['**/queries/**', '**/stores/**', '**/types/**', '**/pages/**', '**/components/**', '**/hooks/**', '**/helpers/**'], message: API_SEM_NEGOCIO },
          { group: ['**/server/**'], message: FRONT_SEM_BACK },
        ],
      }],
    },
  },

  // --- Frontend: queries, stores e types não conhecem tela nem servidor ---
  {
    files: ['src/queries/**/*.{ts,tsx}', 'src/stores/**/*.{ts,tsx}', 'src/types/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: BACKEND_ONLY,
        patterns: [
          { group: ['**/pages/**', '**/components/**', '**/hooks/**', '**/helpers/**'], message: QUERIES_SEM_TELA },
          { group: ['**/server/**'], message: FRONT_SEM_BACK },
        ],
      }],
    },
  },

  // --- Frontend: a tela não fala HTTP nem toca o servidor ---
  {
    files: TELA,
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          ...BACKEND_ONLY,
          { name: 'axios', message: PAGES_SEM_HTTP },
          { name: '@tanstack/react-query', message: PAGES_SEM_HTTP },
        ],
        patterns: [
          { group: ['**/api/**'], message: PAGES_SEM_HTTP },
          { group: ['**/server/**'], message: FRONT_SEM_BACK },
        ],
      }],
    },
  },

  // --- Frontend: sem cor fixa (o tema é o único lugar com cor) ---
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...SEM_COR_FIXA],
    },
  },
])

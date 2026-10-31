// O administrador com que os dois harnesses entram: o vitest por `inject()`
// (tests/helpers/app.ts) e o Playwright pela tela de login
// (tests/e2e/auth.setup.ts).
//
// Num arquivo só, sem importar o servidor: o spec do navegador não tem por que
// carregar Prisma e argon2 para saber um e-mail. Quem CRIA a conta é o
// `database.ts`, que importa daqui.
//
// A senha vem do `.env.test`, que os dois harnesses leem; o padrão só existe
// para o arquivo ser importável fora deles.
export const ADMIN_DE_TESTE = {
  email: 'admin@sentinel.local',
  password: process.env.ADMIN_PASSWORD ?? 'senha-do-admin-de-teste',
};

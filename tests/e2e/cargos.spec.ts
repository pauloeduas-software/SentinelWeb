import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import { tituloDaPagina, vigiarConsole } from './helpers';

// OS CARGOS NA TELA (AV): o menu mostra o que o cargo alcança, e a URL digitada
// do que ele não alcança volta para a raiz. Quem autoriza é o servidor
// (`tests/invariantes/permissao.test.ts`); aqui se prova que a tela não oferece
// o clique que voltaria 403.
//
// A conta nasce pela API, com a sessão do administrador, e entra pela tela como
// a pessoa entraria: a temporária, e a senha dela no primeiro acesso (AU).

const OPERACAO = ['Computadores', 'Postos', 'Estoque', 'Licenças', 'Descobertas', 'Colaboradores'];

async function entrarComo(browser: Browser, request: APIRequestContext, role: 'TECNICO' | 'SUPERVISOR') {
  const email = `${role.toLowerCase()}.${Date.now()}@teste.local`;
  const criada = await request.post('/api/users', { data: { name: `Conta ${role}`, email, role } });
  expect(criada.status()).toBe(201);
  const { temporaryPassword } = (await criada.json()) as { temporaryPassword: string };

  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await contexto.newPage();
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(temporaryPassword);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByLabel('Nova senha', { exact: true }).fill('senha-do-cargo-e2e');
  await page.getByLabel('Repita a nova senha').fill('senha-do-cargo-e2e');
  await page.getByRole('button', { name: 'Definir senha' }).click();
  await expect(page).toHaveURL(/\/computadores$/);
  return { page, fechar: () => contexto.close() };
}

test('o Técnico vê a operação, e não Configurações nem Usuários', async ({ browser, request }) => {
  const { page, fechar } = await entrarComo(browser, request, 'TECNICO');
  const conferirConsole = vigiarConsole(page);

  const menu = page.getByRole('navigation');
  for (const nome of OPERACAO) await expect(menu.getByRole('link', { name: nome, exact: true })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Configurações', exact: true })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Usuários', exact: true })).toHaveCount(0);

  // A URL digitada também não abre: volta para a raiz.
  await page.goto('/configuracoes');
  await expect(page).toHaveURL(/\/computadores$/);
  await expect(tituloDaPagina(page, 'Computadores')).toBeVisible();

  conferirConsole();
  await fechar();
});

test('o Supervisor vê Configurações, e não Usuários', async ({ browser, request }) => {
  const { page, fechar } = await entrarComo(browser, request, 'SUPERVISOR');
  const conferirConsole = vigiarConsole(page);

  const menu = page.getByRole('navigation');
  await menu.getByRole('link', { name: 'Configurações', exact: true }).click();
  await expect(tituloDaPagina(page, 'Configurações')).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Usuários', exact: true })).toHaveCount(0);

  await page.goto('/usuarios');
  await expect(page).toHaveURL(/\/computadores$/);

  conferirConsole();
  await fechar();
});

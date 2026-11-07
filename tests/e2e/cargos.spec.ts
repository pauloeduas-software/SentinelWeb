import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import { criarAtivo, criarItem, criarLicenca, criarPosto, tituloDaPagina, vigiarConsole } from './helpers';

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

  await page.getByLabel(/^Nova senha/).fill('senha-do-cargo-e2e');
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

test('na linha do computador, o Técnico não vê Dar baixa', async ({ browser, request }) => {
  const id = await criarAtivo(request);
  const { assetTag } = await (await request.get(`/api/assets/${id}`)).json() as { assetTag: string };
  const { page, fechar } = await entrarComo(browser, request, 'TECNICO');

  await page.goto(`/computadores?busca=${assetTag}`);
  await page.getByRole('button', { name: `Ações de ${assetTag}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Clonar' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Dar baixa' })).toHaveCount(0);

  await fechar();
});

test('na linha do posto, o Técnico adiciona, e o cadastro não aparece', async ({ browser, request }) => {
  const nome = `Posto da linha ${Date.now()}`;
  await criarPosto(request, nome);
  const { page, fechar } = await entrarComo(browser, request, 'TECNICO');

  await page.goto(`/postos?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Adicionar ao posto', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Editar' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Excluir' })).toHaveCount(0);

  await fechar();
});

test('no card do computador, o valor da compra não aparece para o Técnico', async ({ browser, request }) => {
  const id = await criarAtivo(request, { orderNumber: 'PC-DO-CARGO', purchaseCost: '1500.00' });
  const { page, fechar } = await entrarComo(browser, request, 'TECNICO');

  await page.goto(`/computadores/${id}`);
  await expect(page.getByText('PC-DO-CARGO')).toBeVisible();
  await expect(page.getByText('Valor da compra')).toHaveCount(0);

  await fechar();
});

test('na ficha, o Técnico opera, e o que é do Supervisor não aparece', async ({ browser, request }) => {
  const nomeDoItem = `Item do cargo ${Date.now()}`;
  const nomeDaLicenca = `Licença do cargo ${Date.now()}`;
  const item = await criarItem(request, nomeDoItem);
  const licenca = await criarLicenca(request, nomeDaLicenca);
  const posto = await criarPosto(request, `Posto do cargo ${Date.now()}`);
  const { page, fechar } = await entrarComo(browser, request, 'TECNICO');
  const principal = page.getByRole('main');

  await page.goto(`/estoque/${item}`);
  await expect(principal.getByRole('button', { name: 'Entregar' })).toBeVisible();
  await expect(principal.getByRole('button', { name: 'Editar' })).toBeVisible();
  await expect(principal.getByRole('button', { name: `Ações de ${nomeDoItem}` })).toHaveCount(0);

  // Licença é contrato e dinheiro: o Técnico entrega, e não edita.
  await page.goto(`/licencas/${licenca}`);
  await expect(principal.getByRole('button', { name: 'Entregar' })).toBeVisible();
  await expect(principal.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await expect(principal.getByRole('button', { name: `Ações de ${nomeDaLicenca}` })).toHaveCount(0);

  // O posto: o Técnico coloca gente nele, e o cadastro é do Supervisor.
  await page.goto(`/postos/${posto}`);
  await expect(principal.getByRole('button', { name: 'Adicionar ao posto' })).toBeVisible();
  await expect(principal.getByRole('button', { name: 'Editar' })).toHaveCount(0);

  await fechar();
});

test('na ficha, o Supervisor desativa, encerra e exclui', async ({ browser, request }) => {
  const nomeDoItem = `Item do Supervisor ${Date.now()}`;
  const nomeDaLicenca = `Licença do Supervisor ${Date.now()}`;
  const item = await criarItem(request, nomeDoItem);
  const licenca = await criarLicenca(request, nomeDaLicenca);
  const { page, fechar } = await entrarComo(browser, request, 'SUPERVISOR');

  await page.goto(`/estoque/${item}`);
  await page.getByRole('button', { name: `Ações de ${nomeDoItem}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Desativar' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Excluir' })).toBeVisible();

  await page.goto(`/licencas/${licenca}`);
  await expect(page.getByRole('main').getByRole('button', { name: 'Editar' })).toBeVisible();
  await page.getByRole('button', { name: `Ações de ${nomeDaLicenca}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Encerrar' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Excluir' })).toBeVisible();

  await fechar();
});

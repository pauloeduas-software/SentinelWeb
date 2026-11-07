import { test, expect, type Locator, type Page } from '@playwright/test';
import { criarAtivo, criarColaborador, criarItem, criarLicenca, criarPosto } from './helpers';

// A RESPOSTA A UM CLIQUE (BF): com sucesso e com recusa, no cartão do canto inferior
// direito; a recusa de formulário fica no painel, porque o cartão cobriria o Salvar.
//
// Sem `vigiarConsole`: o navegador escreve a recusa no console, e aqui ela é o esperado.

/** Até onde a margem do `Notificacoes` vai: ela é em `rem`, e a fonte da página muda com a tela. */
const MARGEM_MAXIMA = 24;

async function conferirCanto(page: Page, cartao: Locator): Promise<void> {
  const caixa = await cartao.boundingBox();
  const janela = page.viewportSize();
  if (!caixa || !janela) throw new Error('o cartão não está na tela');
  expect(janela.width - (caixa.x + caixa.width)).toBeLessThanOrEqual(MARGEM_MAXIMA);
  expect(janela.height - (caixa.y + caixa.height)).toBeLessThanOrEqual(MARGEM_MAXIMA);
}

/** O formulário do painel: o único da página com o botão Salvar. */
function formulario(page: Page): Locator {
  return page.locator('form').filter({ has: page.getByRole('button', { name: /^Salvar/ }) });
}

/** Faz o servidor recusar a rota, só para quem está na tela: quem semeou já passou. */
const recusar = (page: Page, rota: string) => page.route(
  rota,
  (requisicao) => requisicao.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Recusa do teste."}' }),
);

/** Recusa só o Excluir, com link: o cartão com link não some sozinho, e é o pior caso para o painel. */
const recusarComLink = (page: Page, rota: string) => page.route(rota, (requisicao) => (
  requisicao.request().method() === 'DELETE'
    ? requisicao.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Recusa com link.', refs: [{ tipo: 'posto', id: 'mesa', nome: 'Mesa do teste' }] }),
    })
    : requisicao.fallback()
));

async function excluirDaLista(page: Page, nome: string): Promise<void> {
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click();
}

test('a recusa do Excluir sai no canto inferior direito', async ({ page, request }) => {
  const nome = `Fabricante em uso ${Date.now()}`;
  const categoria = await request.post('/api/categories', { data: { name: `Categoria de ${nome}`, type: 'ASSET' } });
  const { id: categoryId } = await categoria.json() as { id: string };
  const fabricante = await request.post('/api/manufacturers', { data: { name: nome } });
  const { id: manufacturerId } = await fabricante.json() as { id: string };
  await request.post('/api/asset-models', { data: { name: `Modelo de ${nome}`, manufacturerId, categoryId } });

  await page.goto('/configuracoes?aba=fabricantes');
  await page.getByRole('searchbox').fill(nome);
  await expect(page.getByRole('row', { name: new RegExp(nome) })).toHaveCount(1);
  await excluirDaLista(page, nome);

  const cartao = page.getByRole('alert');
  await expect(cartao).toContainText('Não é possível excluir');
  await conferirCanto(page, cartao);
});

test('salvar confirma no mesmo canto', async ({ page }) => {
  await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'Nova categoria', exact: true }).click();
  await formulario(page).getByLabel('Nome').fill(`Categoria confirmada ${Date.now()}`);
  await formulario(page).getByRole('button', { name: /^Salvar/ }).click();

  const cartao = page.getByRole('status');
  await expect(cartao).toHaveText('Categoria cadastrada.');
  await conferirCanto(page, cartao);
  await expect(formulario(page)).toBeHidden();
});

test('a recusa do formulário fica no painel, com o Salvar à vista', async ({ page, request }) => {
  const nome = `Fabricante repetido ${Date.now()}`;
  await request.post('/api/manufacturers', { data: { name: nome } });

  await page.goto('/configuracoes?aba=fabricantes');
  await page.getByRole('button', { name: 'Novo fabricante', exact: true }).click();
  await formulario(page).getByLabel('Nome').fill(nome);
  const salvar = formulario(page).getByRole('button', { name: /^Salvar/ });
  await salvar.click();

  await expect(formulario(page).getByRole('alert')).toContainText('Já existe');
  await expect(page.locator('[data-notificacao]')).toHaveCount(0);
  await salvar.click({ trial: true });
});

// A FALHA AO CARREGAR FICA NO LUGAR DA FICHA (BF), e o id continua no endereço: o F5 tenta
// de novo, e o cartão é só para a resposta a um clique.
for (const { lista, frase, criar } of [
  { lista: 'Estoque', frase: 'Item de estoque não encontrado.', criar: criarItem },
  { lista: 'Licenças', frase: 'Licença não encontrada.', criar: criarLicenca },
]) {
  test(`o registro que não existe diz no lugar da ficha, em ${lista}`, async ({ page, request }) => {
    const id = await criar(request, `Registro apagado de ${lista} ${Date.now()}`);
    const endereco = lista === 'Estoque' ? `/api/stock/items/${id}` : `/api/licenses/${id}`;
    expect((await request.delete(endereco)).ok()).toBe(true);

    await page.goto(lista === 'Estoque' ? `/estoque/${id}` : `/licencas/${id}`);
    await expect(page.getByRole('main').getByText(frase)).toBeVisible();
    await expect(page.getByRole('link', { name: `Voltar para ${lista}` })).toBeVisible();
    await expect(page.locator('[data-notificacao]')).toHaveCount(0);
  });
}

test('a ficha sem resposta do servidor diz no lugar dela, e o F5 tenta de novo', async ({ page, request }) => {
  const nome = `Item do link ${Date.now()}`;
  const id = await criarItem(request, nome);
  const rota = `**/api/stock/items/${id}`;
  await page.route(rota, (requisicao) => requisicao.fulfill({
    status: 500, contentType: 'application/json', body: '{"error":"Falha do teste."}',
  }));

  await page.goto(`/estoque/${id}`);
  await expect(page.getByRole('main').getByText('Não foi possível abrir o item: Falha do teste.')).toBeVisible();
  await expect(page.locator('[data-notificacao]')).toHaveCount(0);

  await page.unroute(rota);
  await page.reload();
  await expect(page.getByRole('banner').getByRole('heading', { name: nome })).toBeVisible();
});

test('a ficha aberta não fecha quando a atualização falha', async ({ page, request }) => {
  const nome = `Item da ficha ${Date.now()}`;
  const id = await criarItem(request, nome);
  await page.goto(`/estoque/${id}`);
  const titulo = page.getByRole('banner').getByRole('heading', { name: nome });
  await expect(titulo).toBeVisible();

  let falhas = 0;
  await page.route(`**/api/stock/items/${id}`, (requisicao) => {
    falhas += 1;
    return requisicao.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Falha do teste."}' });
  });
  // O que a volta para a aba faz: a consulta atualiza sozinha, e aqui ela falha duas vezes.
  await page.evaluate('document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))');
  await expect.poll(() => falhas, { timeout: 8_000 }).toBe(2);

  await expect(page.getByRole('main').getByText('Não foi possível atualizar o item: Falha do teste.')).toBeVisible();
  await expect(titulo).toBeVisible();
  await expect(page.locator('[data-notificacao]')).toHaveCount(0);
});

for (const { ficha, criar, api, endereco } of [
  { ficha: 'do computador', criar: criarAtivo, api: 'assets', endereco: 'computadores' },
  { ficha: 'do colaborador', criar: (request: Parameters<typeof criarAtivo>[0]) => criarColaborador(request, `Pessoa da ficha ${Date.now()}`), api: 'people', endereco: 'colaboradores' },
]) {
  test(`a ficha ${ficha} não some quando a atualização falha`, async ({ page, request }) => {
    const id = await criar(request);
    await page.goto(`/${endereco}/${id}`);
    await expect(page.getByRole('main').getByRole('tablist')).toBeVisible();

    let falhas = 0;
    await page.route(`**/api/${api}/${id}`, (requisicao) => {
      falhas += 1;
      return requisicao.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Falha do teste."}' });
    });
    await page.evaluate('document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))');
    await expect.poll(() => falhas, { timeout: 8_000 }).toBe(2);
    await page.waitForTimeout(300);

    await expect(page.getByRole('main').getByRole('tablist')).toBeVisible();
    await expect(page.getByRole('main').getByText('Falha do teste.')).toHaveCount(0);
  });
}

test('a resposta nova tira a anterior', async ({ page, request }) => {
  const nome = `Fabricante da resposta ${Date.now()}`;
  await request.post('/api/manufacturers', { data: { name: nome } });
  await page.goto('/configuracoes?aba=fabricantes');
  await page.getByRole('searchbox').fill(nome);
  await expect(page.getByRole('row', { name: new RegExp(nome) })).toHaveCount(1);

  const rota = '**/api/manufacturers/*';
  await recusar(page, rota);
  await excluirDaLista(page, nome);
  await expect(page.getByRole('alert')).toHaveText('Recusa do teste.');

  await page.unroute(rota);
  await excluirDaLista(page, nome);
  await expect(page.getByRole('status')).toHaveText('Fabricante excluído.');
  await expect(page.locator('[data-notificacao]')).toHaveCount(1);
});

for (const { width, height } of [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 800, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`o cartão aberto sai da frente dos botões do painel a ${width}×${height}`, async ({ page, request }) => {
    await page.setViewportSize({ width, height });
    const nome = `Fabricante do canto ${Date.now()}`;
    await request.post('/api/manufacturers', { data: { name: nome } });
    await page.goto('/configuracoes?aba=fabricantes');
    await page.getByRole('searchbox').fill(nome);
    await expect(page.getByRole('row', { name: new RegExp(nome) })).toHaveCount(1);

    await recusarComLink(page, '**/api/manufacturers/*');
    await excluirDaLista(page, nome);
    const cartao = page.locator('[data-notificacao]');
    await expect(cartao).toContainText('Recusa com link.');
    await conferirCanto(page, cartao);

    await page.getByRole('button', { name: 'Novo fabricante', exact: true }).click();
    await formulario(page).getByRole('button', { name: 'Cancelar' }).click({ trial: true });
    await formulario(page).getByLabel('Nome').fill(`${nome} novo`);

    // A resposta do Salvar não leva o cartão com link: é o único que espera alguém fechar.
    await formulario(page).getByRole('button', { name: /^Salvar/ }).click();
    await expect(page.getByRole('status')).toHaveText('Fabricante cadastrado.');
    await expect(formulario(page)).toBeHidden();
    await expect(cartao.filter({ hasText: 'Recusa com link.' })).toBeVisible();
    await conferirCanto(page, page.getByRole('status'));
  });
}

test('fechar o cartão não fecha o painel aberto', async ({ page, request }) => {
  const nome = `Fabricante do X ${Date.now()}`;
  await request.post('/api/manufacturers', { data: { name: nome } });
  await page.goto('/configuracoes?aba=fabricantes');
  await page.getByRole('searchbox').fill(nome);
  await expect(page.getByRole('row', { name: new RegExp(nome) })).toHaveCount(1);
  await recusarComLink(page, '**/api/manufacturers/*');
  await excluirDaLista(page, nome);
  await expect(page.locator('[data-notificacao]')).toContainText('Recusa com link.');

  await page.getByRole('button', { name: 'Novo fabricante', exact: true }).click();
  await expect(formulario(page)).toBeVisible();
  // Pelo papel: com a região na página, o modal do Radix não esconde o cartão do leitor de tela.
  await page.getByRole('button', { name: 'Fechar notificação' }).click();

  await expect(page.locator('[data-notificacao]')).toHaveCount(0);
  await expect(formulario(page)).toBeVisible();
});

test('a região das notificações já está na página antes da primeira mensagem', async ({ page }) => {
  await page.goto('/configuracoes');
  await expect(page.getByRole('region', { name: 'Notificações' })).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('[data-notificacao]')).toHaveCount(0);
});

/** Salva e deixa o cartão de sucesso na tela, com o mouse fora dele. */
async function cartaoDeSucesso(page: Page): Promise<Locator> {
  await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'Nova categoria', exact: true }).click();
  await formulario(page).getByLabel('Nome').fill(`Categoria segurada ${Date.now()}`);
  await formulario(page).getByRole('button', { name: /^Salvar/ }).click();
  await page.mouse.move(0, 0);
  const cartao = page.getByRole('status');
  await expect(cartao).toHaveText('Categoria cadastrada.');
  return cartao;
}

/** Um pouco além dos 3 segundos do sucesso: sem pausa, o cartão já teria saído. */
const ALEM_DO_PRAZO = 3_500;

test('o mouse em cima segura o cartão, e ao sair o prazo recomeça', async ({ page }) => {
  const cartao = await cartaoDeSucesso(page);
  await cartao.hover();
  await page.waitForTimeout(ALEM_DO_PRAZO);
  await expect(cartao).toBeVisible();

  await page.mouse.move(0, 0);
  await expect(cartao).toBeHidden({ timeout: ALEM_DO_PRAZO });
});

test.describe('com o dedo', () => {
  test.use({ hasTouch: true });

  test('tocar no cartão não prende ele na tela', async ({ page }) => {
    const cartao = await cartaoDeSucesso(page);
    const caixa = await cartao.boundingBox();
    if (!caixa) throw new Error('o cartão não está na tela');
    await page.touchscreen.tap(caixa.x + 40, caixa.y + 10);
    await expect(cartao).toBeHidden({ timeout: ALEM_DO_PRAZO });
  });
});

test('o foco dentro do cartão segura o prazo', async ({ page }) => {
  const cartao = await cartaoDeSucesso(page);
  const fechar = page.getByRole('button', { name: 'Fechar notificação' });
  await fechar.focus();
  await page.waitForTimeout(ALEM_DO_PRAZO);
  await expect(cartao).toBeVisible();

  await fechar.blur();
  await expect(cartao).toBeHidden({ timeout: ALEM_DO_PRAZO });
});

test('a página fora de vista segura o prazo', async ({ page }) => {
  const cartao = await cartaoDeSucesso(page);
  const mudarVisibilidade = (oculta: boolean) => page.evaluate(`
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => ${String(oculta)} });
    document.dispatchEvent(new Event('visibilitychange'));
  `);
  await mudarVisibilidade(true);
  await page.waitForTimeout(ALEM_DO_PRAZO);
  await expect(cartao).toBeVisible();

  await mudarVisibilidade(false);
  await expect(cartao).toBeHidden({ timeout: ALEM_DO_PRAZO });
});

test('copiar confirma no próprio botão, e a falha vai para o cartão', async ({ page, request }) => {
  const nome = `Conta do copiar ${Date.now()}`;
  const criada = await request.post('/api/users', { data: { name: nome, email: `copiar.${Date.now()}@teste.local`, role: 'TECNICO' } });
  expect(criada.status()).toBe(201);
  await page.goto('/usuarios');
  await page.getByRole('searchbox').fill(nome);
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: 'Gerar senha temporária' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Gerar' }).click();

  const escrever = (resultado: string) => page.evaluate(
    `Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: () => ${resultado} })`,
  );
  const copiar = page.getByRole('button', { name: 'Copiar', exact: true });
  await escrever('Promise.resolve()');
  await copiar.click();
  await expect(page.getByRole('button', { name: 'Copiada', exact: true })).toBeVisible();
  await expect(page.locator('[data-notificacao]')).toHaveCount(0);
  await expect(copiar).toBeVisible({ timeout: 3_000 });

  await escrever('Promise.reject(new Error("negado"))');
  await copiar.click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível copiar a senha');
});

test('copiar de novo não encurta o retorno do botão', async ({ page, request }) => {
  const nome = `Conta do retorno ${Date.now()}`;
  const criada = await request.post('/api/users', { data: { name: nome, email: `retorno.${Date.now()}@teste.local`, role: 'TECNICO' } });
  expect(criada.status()).toBe(201);
  await page.goto('/usuarios');
  await page.getByRole('searchbox').fill(nome);
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: 'Gerar senha temporária' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Gerar' }).click();
  await page.evaluate(
    'Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: () => Promise.resolve() })',
  );

  await page.getByRole('button', { name: 'Copiar', exact: true }).click();
  await page.waitForTimeout(1_500);
  await page.getByRole('button', { name: 'Copiada', exact: true }).click();
  await page.waitForTimeout(1_000);
  await expect(page.getByRole('button', { name: 'Copiada', exact: true })).toBeVisible();
});

test('o Reconciliar agora responde com o placar no cartão', async ({ page }) => {
  await page.goto('/descobertas');
  await page.getByRole('button', { name: 'Reconciliar agora' }).first().click();

  const cartao = page.getByRole('status');
  await expect(cartao).toContainText('sem vínculo');
  await expect(cartao).toContainText('sugest');
  await conferirCanto(page, cartao);
});

test('a recusa na ficha do posto sai no cartão, e a linha continua aberta', async ({ page, request }) => {
  const nomeDoPosto = `Mesa do cartão ${Date.now()}`;
  const pessoa = `Pessoa do cartão ${Date.now()}`;
  await criarPosto(request, nomeDoPosto);
  const criada = await request.post('/api/people', { data: { name: pessoa } });
  const { id: personId } = await criada.json() as { id: string };

  await page.goto(`/postos?busca=${encodeURIComponent(nomeDoPosto)}`);
  await page.getByRole('row', { name: new RegExp(nomeDoPosto) }).click();
  await expect(page).toHaveURL(/\/postos\/[^/?]+/);
  const workstationId = new URL(page.url()).pathname.split('/').pop();
  const ocupacao = await request.post(`/api/workstations/${workstationId}/occupants`, { data: { personId } });
  expect(ocupacao.ok()).toBe(true);
  const ativo = await criarAtivo(request);
  const entrega = await request.post(`/api/assets/${ativo}/checkout`, { data: { targetType: 'WORKSTATION', targetWorkstationId: workstationId } });
  expect(entrega.ok()).toBe(true);
  await page.reload();

  await recusar(page, `**/api/workstations/${workstationId}/occupants/*`);
  await page.getByRole('button', { name: `Ações de ${pessoa}` }).click();
  await page.getByRole('menuitem', { name: 'Encerrar ocupação' }).click();
  const confirmar = page.getByRole('button', { name: `Confirmar o encerramento da ocupação de ${pessoa}` });
  await confirmar.click();

  const cartao = page.getByRole('alert');
  await expect(cartao).toHaveText('Recusa do teste.');
  await conferirCanto(page, cartao);
  await expect(confirmar).toBeVisible();
  await page.getByRole('button', { name: 'Fechar notificação' }).click();

  await recusar(page, `**/api/assets/${ativo}/checkin`);
  await page.getByRole('tab', { name: /Computador/ }).click();
  await page.getByRole('button', { name: /^Ações de ATV-/ }).click();
  await page.getByRole('menuitem', { name: 'Devolver' }).click();
  const confirmarDevolucao = page.getByRole('button', { name: /^Confirmar a devolução/ });
  await confirmarDevolucao.click();
  await expect(page.getByRole('alert')).toHaveText('Recusa do teste.');
  await conferirCanto(page, page.getByRole('alert'));
  await expect(confirmarDevolucao).toBeVisible();
});

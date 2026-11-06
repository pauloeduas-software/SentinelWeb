import { test, expect, type APIRequestContext } from '@playwright/test';
import { criarAtivo, criarPosto, tituloDaPagina, vigiarConsole } from './helpers';

// A FICHA DO POSTO É PÁGINA, e a lista continua como estava na volta: o recorte, a
// página e a busca moram na URL dela (`usePostos`). O servidor não entra aqui: o
// que se prova é o caminho de ida e volta.

/** Um computador entregue a um posto novo, sem ninguém nele. */
async function computadorNoPosto(request: APIRequestContext, nome: string) {
  const posto = await criarPosto(request, nome);
  const ativo = await criarAtivo(request);
  const { assetTag } = await (await request.get(`/api/assets/${ativo}`)).json() as { assetTag: string };
  const entrega = await request.post(`/api/assets/${ativo}/checkout`, {
    data: { targetType: 'WORKSTATION', targetWorkstationId: posto },
  });
  expect(entrega.status()).toBe(201);
  return { posto, ativo, assetTag };
}

test('a linha abre a página do posto, e a seta volta com o cartão escolhido', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Mesa da ficha ${Date.now()}`;
  await criarPosto(request, nome);

  await page.goto('/postos');
  const semUso = page.getByRole('main').getByRole('button', { name: /Sem uso/ });
  await semUso.click();
  await expect(page).toHaveURL(/\?situacao=sem-uso$/);

  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await expect(page).toHaveURL(/\/postos\/[^/?]+$/);
  await expect(tituloDaPagina(page, nome)).toBeVisible();
  await expect(page.getByRole('tab', { name: /Ocupantes/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('link', { name: 'Voltar para Postos' }).click();
  await expect(page).toHaveURL(/\/postos\?situacao=sem-uso$/);
  await expect(semUso).toHaveAttribute('aria-pressed', 'true');

  conferirConsole();
});

test('a busca volta no campo depois de abrir um posto', async ({ page, request }) => {
  const nome = `Mesa da busca ${Date.now()}`;
  await criarPosto(request, nome);

  await page.goto('/postos');
  const busca = page.getByRole('searchbox');
  await busca.pressSequentially(nome);
  await expect(page.locator('tbody tr')).toHaveCount(1);

  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await expect(tituloDaPagina(page, nome)).toBeVisible();

  await page.goBack();
  await expect(busca).toHaveValue(nome);
  await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('duas trocas seguidas na lista valem as duas', async ({ page }) => {
  await page.goto('/postos?situacao=ocupados&busca=mesa');
  const principal = page.getByRole('main');
  await expect(principal.getByRole('button', { name: /Ocupados/ })).toHaveAttribute('aria-pressed', 'true');

  // O clique e a limpeza no mesmo instante, antes de a lista desenhar de novo.
  await page.evaluate(`(() => {
    const botoes = [...document.querySelectorAll('main button[aria-pressed]')];
    botoes.find((botao) => botao.textContent.includes('Total')).click();
    const campo = document.querySelector('main input[type=search]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, '');
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);

  await expect(principal.getByRole('button', { name: /Ocupados/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page).not.toHaveURL(/situacao|busca/);
});

test('Editar na ficha salva e continua na ficha, com a nota no card', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Mesa editada ${Date.now()}`;
  await criarPosto(request, nome);

  await page.goto(`/postos?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await page.getByRole('button', { name: 'Editar' }).click();

  const formulario = page.getByRole('dialog');
  await formulario.getByLabel('Notas').fill('Perto da janela');
  await formulario.getByRole('button', { name: 'Salvar' }).click();

  await expect(formulario).toHaveCount(0);
  await expect(page.getByRole('main').getByText('Perto da janela')).toBeVisible();
  await expect(tituloDaPagina(page, nome)).toBeVisible();

  conferirConsole();
});

test('Excluir na ficha volta para a lista, sem o posto', async ({ page, request }) => {
  const nome = `Mesa excluída ${Date.now()}`;
  await criarPosto(request, nome);

  await page.goto(`/postos?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click();

  await expect(page).toHaveURL(/\/postos$/);
  await expect(page.getByRole('row', { name: new RegExp(nome) })).toHaveCount(0);
});

test('o computador do posto fica na lista, e a seta da ficha dele volta ao posto na aba Computador', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Mesa do computador ${Date.now()}`;
  const { posto, ativo, assetTag } = await computadorNoPosto(request, nome);

  await page.goto(`/computadores?busca=${assetTag}`);
  const linha = page.getByRole('row', { name: new RegExp(assetTag) });
  await expect(linha.getByText(`Local de ${nome}`)).toBeVisible();
  await expect(linha.getByText(`no posto ${nome}`)).toBeVisible();
  await expect(linha.getByText('Posto vago')).toBeVisible();

  await page.goto(`/postos/${posto}?aba=computador`);
  await page.getByRole('row', { name: new RegExp(assetTag) }).click();
  await expect(page).toHaveURL(new RegExp(`/computadores/${ativo}$`));

  await page.getByRole('link', { name: 'Voltar para Posto' }).click();
  await expect(page).toHaveURL(new RegExp(`/postos/${posto}\\?aba=computador$`));
  await expect(page.getByRole('tab', { name: /Computador/ })).toHaveAttribute('aria-selected', 'true');

  conferirConsole();
});

test('depois de passar pelo computador, a seta do posto ainda volta à lista como estava', async ({ page, request }) => {
  const nome = `Mesa das duas setas ${Date.now()}`;
  const { posto, assetTag } = await computadorNoPosto(request, nome);

  await page.goto(`/postos?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await expect(page).toHaveURL(new RegExp(`/postos/${posto}$`));
  await page.getByRole('main').getByRole('link', { name: assetTag }).click();

  await page.getByRole('link', { name: 'Voltar para Posto' }).click();
  await expect(page).toHaveURL(new RegExp(`/postos/${posto}$`));

  await page.getByRole('link', { name: 'Voltar para Postos' }).click();
  await expect(page).toHaveURL(/\/postos\?busca=/);
  await expect(page.getByRole('searchbox')).toHaveValue(nome);
});

test('o computador que não abre oferece voltar ao posto de onde se veio', async ({ page, request }) => {
  const nome = `Mesa da ficha que falha ${Date.now()}`;
  const { posto, ativo, assetTag } = await computadorNoPosto(request, nome);
  await page.route(`**/api/assets/${ativo}`, (rota) => rota.fulfill({ status: 404, json: { error: 'Ativo não encontrado.' } }));

  await page.goto(`/postos/${posto}?aba=computador`);
  await page.getByRole('row', { name: new RegExp(assetTag) }).click();

  await expect(tituloDaPagina(page, 'Computadores')).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para Posto' }).click();
  await expect(page).toHaveURL(new RegExp(`/postos/${posto}\\?aba=computador$`));
});

test('o ⋯ da linha do computador no posto: Editar avisa, Excluir recusa e Devolver tira o posto da linha', async ({ page, request }) => {
  const nome = `Mesa do menu ${Date.now()}`;
  const { assetTag } = await computadorNoPosto(request, nome);

  await page.goto(`/computadores?busca=${assetTag}`);
  const linha = page.getByRole('row', { name: new RegExp(assetTag) });
  const acoes = page.getByRole('button', { name: `Ações de ${assetTag}` });
  const painel = page.locator('[data-painel-lateral]');

  await acoes.click();
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  await expect(painel.getByText(`Entregue ao posto ${nome}`)).toBeVisible();
  await painel.getByRole('button', { name: 'Cancelar' }).click();

  await acoes.click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByRole('alert')).toHaveText('Este ativo está entregue e não pode ir para a lixeira. Faça a devolução antes.');
  await expect(linha).toBeVisible();

  await acoes.click();
  await page.getByRole('menuitem', { name: 'Devolver' }).click();
  await painel.getByRole('button', { name: 'Devolver', exact: true }).click();
  await expect(painel).toHaveCount(0);

  await expect(linha.getByText(`no posto ${nome}`)).toHaveCount(0);
  await expect(linha.getByText(`Local de ${nome}`)).toHaveCount(0);
  await expect(linha.getByText('Posto vago')).toHaveCount(0);
});

test('o link de um posto que não existe avisa e leva de volta à lista', async ({ page }) => {
  await page.goto('/postos/00000000-0000-4000-8000-000000000000');

  await expect(page.getByText('Posto não encontrado.')).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para Postos' }).click();
  await expect(tituloDaPagina(page, 'Postos')).toBeVisible();
});

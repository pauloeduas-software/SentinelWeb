import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  criarColaborador, criarItem, criarPosto, tituloDaPagina, vigiarConsole,
} from './helpers';

// A FICHA DO ITEM É PÁGINA (BK), como a do posto: a lista continua como estava na volta,
// e quem veio de outra ficha volta para ela. O servidor não entra aqui: o que se prova é
// o caminho de ida e volta e o que cada tipo de item mostra.

/** Duas unidades do item, com uma pessoa nova. Devolve o id e o nome dela. */
async function entregarAPessoa(request: APIRequestContext, item: string) {
  const nome = `Pessoa do item ${Date.now()}`;
  const targetPersonId = await criarColaborador(request, nome);
  const entrega = await request.post(`/api/stock/items/${item}/checkout`, {
    data: { targetType: 'PERSON', targetPersonId, qty: 2 },
  });
  expect(entrega.status()).toBe(201);
  return { pessoa: targetPersonId, nome };
}

test('a linha abre a página do item, e a seta volta com a busca', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Item da ficha ${Date.now()}`;
  await criarItem(request, nome);

  await page.goto(`/estoque?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await expect(page).toHaveURL(/\/estoque\/[^/?]+$/);
  await expect(tituloDaPagina(page, nome)).toBeVisible();
  await expect(page.getByRole('tab', { name: /Responsáveis/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('link', { name: 'Voltar para Estoque' }).click();
  await expect(page).toHaveURL(/\/estoque\?busca=/);
  await expect(page.getByRole('main').getByRole('searchbox')).toHaveValue(nome);

  conferirConsole();
});

test('o F5 fica na aba', async ({ page, request }) => {
  const id = await criarItem(request, `Item do F5 ${Date.now()}`);

  await page.goto(`/estoque/${id}`);
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page).toHaveURL(/\?aba=historico$/);

  await page.reload();
  await expect(page.getByRole('tab', { name: 'Histórico' })).toHaveAttribute('aria-selected', 'true');
});

test('da ficha do colaborador, abre filtrado por ele, e a seta volta para a mesma aba', async ({ page, request }) => {
  const nomeDoItem = `Item do colaborador ${Date.now()}`;
  const id = await criarItem(request, nomeDoItem);
  const { pessoa, nome } = await entregarAPessoa(request, id);

  await page.goto(`/colaboradores/${pessoa}?aba=estoque`);
  await page.getByRole('row', { name: new RegExp(nomeDoItem) }).click();
  await expect(page).toHaveURL(new RegExp(`/estoque/${id}\\?quem=`));
  await expect(page.getByRole('main').getByRole('searchbox')).toHaveValue(nome);
  await expect(page.getByRole('main').getByRole('listitem').filter({ hasText: nome })).toBeVisible();
  // O número é o do item, e não o que a busca achou: aparece também com o `?quem=`.
  await expect(page.getByRole('tab', { name: /Responsáveis/ })).toContainText('1');

  await page.getByRole('link', { name: 'Voltar para Colaborador' }).click();
  await expect(page).toHaveURL(new RegExp(`/colaboradores/${pessoa}\\?aba=estoque$`));
  await expect(page.getByRole('tab', { name: /Estoque/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: 'Voltar para Colaboradores' })).toBeVisible();
});

test('a busca fica no endereço: trocar de aba não a perde, limpar a tira, e a seta continua sabendo a volta', async ({ page, request }) => {
  const nome = `Item da busca ${Date.now()}`;
  await criarItem(request, nome);
  await page.goto(`/estoque?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).click();

  const busca = page.getByRole('main').getByRole('searchbox');
  await busca.fill('Laura');
  await expect(page).toHaveURL(/\?quem=Laura$/);

  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page).toHaveURL(/aba=historico/);
  await expect(page).toHaveURL(/quem=Laura/);

  await page.reload();
  await page.getByRole('tab', { name: /Responsáveis/ }).click();
  await expect(busca).toHaveValue('Laura');

  await busca.fill('');
  await expect(page).not.toHaveURL(/quem=/);
  await page.reload();
  await expect(busca).toHaveValue('');

  await page.getByRole('link', { name: 'Voltar para Estoque' }).click();
  await expect(page).toHaveURL(/\/estoque\?busca=/);
});

test('o link antigo leva à ficha, com a busca', async ({ page, request }) => {
  const nome = `Item do link antigo ${Date.now()}`;
  const id = await criarItem(request, nome);

  await page.goto(`/estoque?item=${id}&quem=Mesa`);
  await expect(page).toHaveURL(new RegExp(`/estoque/${id}\\?quem=Mesa$`));
  await expect(tituloDaPagina(page, nome)).toBeVisible();
  await expect(page.getByRole('main').getByRole('searchbox')).toHaveValue('Mesa');
});

test('devolver acontece na ficha, e ela acompanha a conta', async ({ page, request }) => {
  const id = await criarItem(request, `Item da devolução ${Date.now()}`);
  await entregarAPessoa(request, id);

  await page.goto(`/estoque/${id}`);
  const principal = page.getByRole('main');
  await expect(principal.getByText('5 no total · 2 em uso · 3 disponíveis')).toBeVisible();

  await principal.getByRole('button', { name: 'Devolver' }).click();
  await principal.getByRole('button', { name: 'Confirmar' }).click();

  await expect(principal.getByText('Nenhum responsável por este item agora.')).toBeVisible();
  await expect(principal.getByText('5 no total · 0 em uso · 5 disponíveis')).toBeVisible();
  await expect(page.locator('[data-notificacao]')).toContainText('Item devolvido.');
  // A entrega e a devolução.
  await expect(principal.getByRole('tab', { name: /Histórico/ })).toContainText('2');
});

test('a linha do posto diz quem está nele, e abre o posto (CJ)', async ({ page, request }) => {
  const nomeDoPosto = `Mesa do item ${Date.now()}`;
  const nomeDaPessoa = `Pessoa da mesa ${Date.now()}`;
  const [id, posto, pessoa] = await Promise.all([
    criarItem(request, `Item da mesa ${Date.now()}`),
    criarPosto(request, nomeDoPosto),
    criarColaborador(request, nomeDaPessoa),
  ]);
  expect((await request.post(`/api/workstations/${posto}/occupants`, { data: { personId: pessoa } })).status()).toBe(201);
  const entrega = await request.post(`/api/stock/items/${id}/checkout`, {
    data: { targetType: 'WORKSTATION', targetWorkstationId: posto, qty: 2 },
  });
  expect(entrega.status()).toBe(201);

  await page.goto(`/estoque/${id}`);
  const linha = page.getByRole('main').getByRole('listitem').filter({ hasText: nomeDoPosto });
  await expect(linha).toContainText(nomeDaPessoa);

  // O Devolver é da linha, e não abre o posto.
  await linha.getByRole('button', { name: 'Devolver' }).click();
  await expect(linha.getByRole('button', { name: 'Confirmar' })).toBeVisible();
  await linha.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL(new RegExp(`/estoque/${id}$`));

  await linha.click();
  await expect(page).toHaveURL(new RegExp(`/postos/${posto}$`));
  await page.getByRole('link', { name: 'Voltar para Item' }).click();
  await expect(page).toHaveURL(new RegExp(`/estoque/${id}$`));
});

test('fechar o painel deixa na ficha, e o que se salvou aparece nela', async ({ page, request }) => {
  const nome = `Item do painel ${Date.now()}`;
  const id = await criarItem(request, nome);
  const painel = page.locator('[data-painel-lateral]');

  await page.goto(`/estoque/${id}`);
  await page.getByRole('main').getByRole('button', { name: 'Entregar' }).click();
  await expect(painel).toBeVisible();
  await painel.getByRole('button', { name: 'Cancelar' }).click();
  await expect(painel).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/estoque/${id}$`));

  await page.getByRole('main').getByRole('button', { name: 'Editar' }).click();
  await painel.getByLabel('Notas').fill('Guardado no armário 3');
  await painel.getByRole('button', { name: 'Salvar' }).click();
  await expect(painel).toBeHidden();
  await expect(page.getByRole('main').getByText('Guardado no armário 3')).toBeVisible();
});

test('excluir vai para a lista', async ({ page, request }) => {
  const nome = `Item a excluir ${Date.now()}`;
  const id = await criarItem(request, nome);

  await page.goto(`/estoque/${id}`);
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click();

  await expect(page).toHaveURL(/\/estoque$/);
  await expect(tituloDaPagina(page, 'Estoque')).toBeVisible();
  await expect(page.locator('[data-notificacao]')).toContainText('Item excluído.');
});

test('o consumível não fica com ninguém: só o histórico', async ({ page, request }) => {
  const id = await criarItem(request, `Toner ${Date.now()}`, 'CONSUMABLE');

  await page.goto(`/estoque/${id}`);
  await expect(page.getByRole('tab', { name: 'Histórico' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab')).toHaveCount(1);
});

test('o componente diz em quais computadores está', async ({ page, request }) => {
  const id = await criarItem(request, `Memória ${Date.now()}`, 'COMPONENT');

  await page.goto(`/estoque/${id}`);
  await expect(page.getByRole('tab', { name: /Computadores/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Responsáveis/ })).toHaveCount(0);
});

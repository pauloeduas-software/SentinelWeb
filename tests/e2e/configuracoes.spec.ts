import { test, expect, type Locator, type Page } from '@playwright/test';
import { tituloDaPagina, vigiarConsole } from './helpers';

// O cadastro do catálogo é o padrão de CRUD do sistema inteiro (CatalogTable +
// useCatalog; decisões AF e AO): se o ciclo fecha em Categorias, fecha nas
// outras quatro abas e em Colaboradores, que usam o mesmo componente.
//
// O nome carrega "E2E" para não bater com o seed. Não há limpeza no fim: o
// banco é esvaziado a cada execução (tests/e2e/preparar.ts), então uma
// execução interrompida no meio não deixa a categoria para a próxima.
const NOME = 'Categoria do E2E';
const NOME_EDITADO = 'Categoria do E2E, editada';

/** O formulário do modal: o único da página com o botão Salvar. */
function formulario(page: Page): Locator {
  return page.locator('form').filter({ has: page.getByRole('button', { name: /^Salvar/ }) });
}

/** Abre o `⋯` da linha e clica na ação. */
async function acaoDaLinha(page: Page, nome: string, acao: string): Promise<void> {
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: acao }).click();
}

test('cada aba aponta para um painel que existe', async ({ page }) => {
  await page.goto('/configuracoes');
  const abas = page.getByRole('tab');
  await expect(abas).toHaveText(['Categorias', 'Fabricantes', 'Modelos', 'Localizações', 'Status']);

  for (const aba of await abas.all()) {
    const alvo = await aba.getAttribute('aria-controls');
    await expect(page.locator(`[id="${alvo}"]`)).toHaveCount(1);
  }

  await page.getByRole('tab', { name: 'Modelos' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Modelos' }).getByRole('table')).toBeVisible();
});

test('a aba fica no endereço: recarregar não volta para a primeira', async ({ page }) => {
  await page.goto('/configuracoes');
  await page.getByRole('tab', { name: 'Modelos' }).click();
  await expect(page).toHaveURL(/\?aba=modelos$/);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Modelos' })).toHaveAttribute('aria-selected', 'true');

  // A primeira aba é o endereço limpo, e a chave que não existe cai nela.
  await page.getByRole('tab', { name: 'Categorias' }).click();
  await expect(page).toHaveURL(/\/configuracoes$/);
  await page.goto('/configuracoes?aba=nao-existe');
  await expect(page.getByRole('tab', { name: 'Categorias' })).toHaveAttribute('aria-selected', 'true');
});

test('o link do menu volta para a primeira aba, sem levar a busca junto', async ({ page }) => {
  await page.goto('/configuracoes?aba=modelos');
  await page.getByRole('searchbox').fill('qualquer coisa');
  await page.getByRole('navigation').getByRole('link', { name: 'Configurações' }).click();
  await expect(page.getByRole('tab', { name: 'Categorias' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox')).toHaveValue('');
});

test('a dica de Computadores vazio leva direto a Modelos', async ({ page }) => {
  await page.goto('/computadores');
  await page.getByRole('main').getByRole('link', { name: 'Configurações' }).click();
  await expect(page.getByRole('tab', { name: 'Modelos' })).toHaveAttribute('aria-selected', 'true');
});

test('a categoria em uso mostra o número e trava o tipo', async ({ page, request }) => {
  const categoria = await request.post('/api/categories', { data: { name: 'Categoria em uso do E2E', type: 'ASSET' } });
  const { id: categoryId } = await categoria.json() as { id: string };
  const fabricante = await request.post('/api/manufacturers', { data: { name: 'Fabricante do E2E' } });
  const { id: manufacturerId } = await fabricante.json() as { id: string };
  const modelo = await request.post('/api/asset-models', {
    data: { name: 'Modelo do E2E', manufacturerId, categoryId },
  });
  expect(modelo.ok()).toBe(true);

  await page.goto('/configuracoes');
  await page.getByRole('searchbox').fill('Categoria em uso do E2E');
  const linha = page.getByRole('row', { name: /Categoria em uso do E2E/ });
  await expect(linha.getByRole('cell').nth(2)).toHaveText('1');

  await linha.click();
  await expect(formulario(page).getByRole('radio', { name: 'Ativo', exact: true })).toBeDisabled();
  await expect(formulario(page)).toContainText('Em uso por 1 registro: o tipo não muda.');
});

test('o site sem https é recusado em português, antes de ir ao servidor', async ({ page }) => {
  await page.goto('/configuracoes');
  await page.getByRole('tab', { name: 'Fabricantes' }).click();
  await page.getByRole('button', { name: 'Novo fabricante', exact: true }).click();

  await formulario(page).getByLabel('Nome').fill('Fabricante do E2E');
  const site = formulario(page).getByLabel('Site');
  await site.fill('dell.com');
  await formulario(page).getByRole('button', { name: /^Salvar/ }).click();

  await expect(formulario(page)).toBeVisible();
  await expect.poll(() => site.evaluate((campo) => (campo as { validationMessage: string }).validationMessage))
    .toBe('Digite o endereço completo, como https://empresa.com.');
});

test('cria, edita e exclui uma categoria', async ({ page }) => {
  const conferirConsole = vigiarConsole(page);
  await page.goto('/configuracoes');
  await expect(tituloDaPagina(page, 'Configurações')).toBeVisible();

  // Criar: o botão abre o formulário de mesmo nome, com a explicação de cada tipo à vista.
  await page.getByRole('button', { name: 'Nova categoria', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nova categoria' })).toBeVisible();
  await expect(formulario(page).getByText('O que se gasta e não volta', { exact: false })).toBeVisible();
  await formulario(page).getByLabel('Nome').fill(NOME);
  await formulario(page).getByRole('radio', { name: 'Estoque', exact: true }).check();
  await formulario(page).getByRole('button', { name: /^Salvar/ }).click();
  await expect(formulario(page)).toBeHidden();
  await expect(page.getByText(NOME, { exact: true })).toBeVisible();

  // Editar pelo clique na linha (AY): o formulário vem preenchido com o que está gravado.
  await page.getByRole('row', { name: new RegExp(NOME) }).click();
  await expect(page.getByRole('heading', { name: 'Editar categoria' })).toBeVisible();
  await expect(formulario(page).getByLabel('Nome')).toHaveValue(NOME);
  await formulario(page).getByLabel('Nome').fill(NOME_EDITADO);
  await formulario(page).getByRole('button', { name: /^Salvar/ }).click();
  await expect(formulario(page)).toBeHidden();
  await expect(page.getByText(NOME_EDITADO, { exact: true })).toBeVisible();
  await expect(page.getByText(NOME, { exact: true })).toHaveCount(0);

  // O `⋯` abre o mesmo formulário.
  await acaoDaLinha(page, NOME_EDITADO, 'Editar');
  await expect(page.getByRole('heading', { name: 'Editar categoria' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();

  // Excluir pergunta antes, com a frase do padrão (sem lixeira).
  await acaoDaLinha(page, NOME_EDITADO, 'Excluir');
  const pergunta = page.getByRole('alertdialog');
  await expect(pergunta.getByRole('heading', { name: `Excluir "${NOME_EDITADO}"?` })).toBeVisible();
  await expect(pergunta).toContainText('Esta ação não tem lixeira.');
  await pergunta.getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByText(NOME_EDITADO, { exact: true })).toHaveCount(0);

  conferirConsole();
});

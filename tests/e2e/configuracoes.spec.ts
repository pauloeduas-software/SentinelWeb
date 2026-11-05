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

/** Escolhe uma opção no seletor do campo: abre pelo rótulo e clica no nome. */
async function escolher(page: Page, rotulo: string, opcao: string): Promise<void> {
  await formulario(page).getByLabel(rotulo).click();
  await page.getByRole('option', { name: opcao, exact: true }).click();
}

/** Abre o `⋯` da linha e clica na ação. */
async function acaoDaLinha(page: Page, nome: string, acao: string): Promise<void> {
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: acao }).click();
}

test('cria, edita e exclui uma categoria', async ({ page }) => {
  const conferirConsole = vigiarConsole(page);
  await page.goto('/configuracoes');
  await expect(tituloDaPagina(page, 'Configurações')).toBeVisible();

  // Criar: o botão "+ Categoria" abre "Nova Categoria".
  await page.getByRole('button', { name: 'Categoria', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nova Categoria' })).toBeVisible();
  await formulario(page).getByLabel('Nome').fill(NOME);
  await escolher(page, 'Tipo', 'Estoque');
  await formulario(page).getByRole('button', { name: /^Salvar/ }).click();
  await expect(formulario(page)).toBeHidden();
  await expect(page.getByText(NOME, { exact: true })).toBeVisible();

  // Editar pelo clique na linha (AY): o formulário vem preenchido com o que está gravado.
  await page.getByRole('row', { name: new RegExp(NOME) }).click();
  await expect(page.getByRole('heading', { name: 'Editar Categoria' })).toBeVisible();
  await expect(formulario(page).getByLabel('Nome')).toHaveValue(NOME);
  await formulario(page).getByLabel('Nome').fill(NOME_EDITADO);
  await formulario(page).getByRole('button', { name: /^Salvar/ }).click();
  await expect(formulario(page)).toBeHidden();
  await expect(page.getByText(NOME_EDITADO, { exact: true })).toBeVisible();
  await expect(page.getByText(NOME, { exact: true })).toHaveCount(0);

  // O `⋯` abre o mesmo formulário.
  await acaoDaLinha(page, NOME_EDITADO, 'Editar');
  await expect(page.getByRole('heading', { name: 'Editar Categoria' })).toBeVisible();
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

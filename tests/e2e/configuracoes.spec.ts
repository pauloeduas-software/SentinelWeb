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

/**
 * Um campo do formulário pelo rótulo. O `<label>` do CatalogFormModal não tem
 * `htmlFor`, então `getByLabel` não o acha: o campo é o controle dentro do
 * mesmo bloco do rótulo.
 */
function campo(form: Locator, rotulo: string): Locator {
  return form
    .locator('label', { hasText: rotulo })
    .locator('xpath=..')
    .locator('input, select, textarea')
    .first();
}

test('cria, edita e exclui uma categoria', async ({ page }) => {
  const conferirConsole = vigiarConsole(page);
  await page.goto('/configuracoes');
  await expect(tituloDaPagina(page, 'Configurações')).toBeVisible();

  // Criar: o botão "+ Categoria" abre "Nova Categoria".
  await page.getByRole('button', { name: 'Categoria', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nova Categoria' })).toBeVisible();
  await campo(formulario(page), 'Nome').fill(NOME);
  await campo(formulario(page), 'Tipo').selectOption('STOCK');
  await formulario(page).getByRole('button', { name: /^Salvar/ }).click();
  await expect(formulario(page)).toBeHidden();
  await expect(page.getByText(NOME, { exact: true })).toBeVisible();

  // Editar: o formulário vem preenchido com o que está gravado.
  await page.getByRole('button', { name: `Editar ${NOME}` }).click();
  await expect(page.getByRole('heading', { name: 'Editar Categoria' })).toBeVisible();
  await expect(campo(formulario(page), 'Nome')).toHaveValue(NOME);
  await campo(formulario(page), 'Nome').fill(NOME_EDITADO);
  await formulario(page).getByRole('button', { name: /^Salvar/ }).click();
  await expect(formulario(page)).toBeHidden();
  await expect(page.getByText(NOME_EDITADO, { exact: true })).toBeVisible();
  await expect(page.getByText(NOME, { exact: true })).toHaveCount(0);

  // Excluir: o `confirm()` do navegador, com a frase do padrão (sem lixeira).
  // O ouvinte entra ANTES do clique; sem ele o Playwright descarta o diálogo.
  let aviso = '';
  page.once('dialog', (dialogo) => {
    aviso = dialogo.message();
    void dialogo.accept();
  });
  await page.getByRole('button', { name: `Excluir ${NOME_EDITADO}` }).click();
  await expect(page.getByText(NOME_EDITADO, { exact: true })).toHaveCount(0);
  expect(aviso).toBe(`Excluir "${NOME_EDITADO}"? Esta ação não tem lixeira.`);

  conferirConsole();
});

import { test, expect } from '@playwright/test';
import { criarPosto, tituloDaPagina, vigiarConsole } from './helpers';

// A FICHA DO POSTO É PÁGINA, e a lista continua como estava na volta: o recorte, a
// página e a busca moram na URL dela (`usePostos`). O servidor não entra aqui: o
// que se prova é o caminho de ida e volta.

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

test('o link de um posto que não existe avisa e leva de volta à lista', async ({ page }) => {
  await page.goto('/postos/00000000-0000-4000-8000-000000000000');

  await expect(page.getByText('Posto de trabalho não encontrado.')).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para Postos' }).click();
  await expect(tituloDaPagina(page, 'Postos')).toBeVisible();
});

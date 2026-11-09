import { test, expect, type Page } from '@playwright/test';
import { criarColaborador, tituloDaPagina, vigiarConsole } from './helpers';

// A FICHA DO COLABORADOR AGE COMO AS OUTRAS (CD): Editar no card e, no `⋯`, Desativar e
// Excluir, com as perguntas e as frases da linha da lista. Aberta da Lixeira, ela é só
// consulta, e a única ação é Restaurar (CF). O servidor está provado em
// `tests/invariantes/colaborador.test.ts`.

/** O formulário lateral: o único da página com o botão Salvar. */
function formulario(page: Page) {
  return page.locator('form').filter({ has: page.getByRole('button', { name: /^Salvar/ }) });
}

test('o card edita, desativa e ativa, com as frases da lista', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Pessoa do card ${Date.now()}`;
  const id = await criarColaborador(request, nome);

  await page.goto(`/colaboradores/${id}`);
  await expect(tituloDaPagina(page, nome)).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByRole('heading', { name: 'Editar colaborador' })).toBeVisible();
  await formulario(page).getByLabel('Notas').fill('Afastada até março.');
  await formulario(page).getByRole('button', { name: /^Salvar/ }).click();
  await expect(page.getByText('Colaborador salvo.')).toBeVisible();
  await expect(page.getByRole('main').getByText('Afastada até março.')).toBeVisible();

  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: 'Desativar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Desativar' }).click();
  await expect(page.getByText('Colaborador desativado.')).toBeVisible();
  await expect(page.getByRole('main').getByText('Desativado', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: 'Ativar' }).click();
  await expect(page.getByText('Colaborador ativado.')).toBeVisible();

  conferirConsole();
});

test('Excluir manda para a lixeira e volta para a lista', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Pessoa excluída pelo card ${Date.now()}`;
  const id = await criarColaborador(request, nome);

  await page.goto(`/colaboradores/${id}`);
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click();

  await expect(page).toHaveURL(/\/colaboradores$/);
  await expect(page.getByText(`"${nome}" foi para a lixeira.`)).toBeVisible();

  conferirConsole();
});

test('a linha da Lixeira abre a ficha só para consulta, e Restaurar devolve as ações', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Pessoa da Lixeira ${Date.now()}`;
  const id = await criarColaborador(request, nome);
  expect((await request.delete(`/api/people/${id}`)).status()).toBe(200);

  await page.goto(`/colaboradores?vista=trashed&busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).getByText(nome).click();
  await expect(page).toHaveURL(new RegExp(`/colaboradores/${id}`));

  const principal = page.getByRole('main');
  await expect(page.getByText('Na lixeira', { exact: true })).toBeVisible();
  await expect(principal.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await expect(principal.getByRole('button', { name: `Ações de ${nome}` })).toHaveCount(0);

  // A seta volta para a Lixeira, como estava.
  await expect(page.getByRole('link', { name: 'Voltar para Colaboradores' })).toHaveAttribute('href', /vista=trashed/);

  await principal.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByText('Colaborador restaurado.')).toBeVisible();
  await expect(page.getByText('Na lixeira', { exact: true })).toHaveCount(0);
  await expect(principal.getByRole('button', { name: 'Editar' })).toBeVisible();

  conferirConsole();
});

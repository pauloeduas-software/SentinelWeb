import { test, expect, type Page } from '@playwright/test';
import { criarPosto } from './helpers';

// AS COLUNAS NÃO SE MEXEM (BA): filtrar troca as linhas, e o cabeçalho fica onde está,
// mesmo quando nada aparece. O nome comprido é o que deslocaria uma tabela que mede o
// conteúdo; `Table` é a mesma em toda lista, então Postos prova por todas.

const posicaoDasColunas = (page: Page) =>
  page.getByRole('columnheader').evaluateAll((titulos) => titulos.map((titulo) => titulo.getBoundingClientRect().left));

test('filtrar não desloca as colunas, nem quando a lista fica vazia', async ({ page, request }) => {
  const nome = `Mesa de nome bem comprido para esticar a coluna ${Date.now()}`;
  await criarPosto(request, nome);

  await page.goto('/postos');
  const principal = page.getByRole('main');
  const busca = page.getByRole('searchbox');
  await busca.pressSequentially(nome);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  const comLinha = await posicaoDasColunas(page);
  expect(comLinha.length).toBeGreaterThan(1);

  // Vazia: o posto novo não está ocupado.
  await principal.getByRole('button', { name: /Ocupados/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await expect(principal.getByText(`Nenhum posto encontrado para "${nome}".`)).toBeVisible();
  expect(await posicaoDasColunas(page)).toEqual(comLinha);

  // De volta com a lista inteira, com outro conteúdo em cada coluna.
  await principal.getByRole('button', { name: /Total/ }).click();
  await busca.clear();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  expect(await posicaoDasColunas(page)).toEqual(comLinha);
});

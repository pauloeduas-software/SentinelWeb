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

// A COLUNA APARECE QUANDO CABE (DH): na moldura estreita, as de menos prioridade somem e
// nenhuma lista rola de lado. O tablet com o menu aberto é o caso que rolava.
const LISTAS = ['/computadores', '/postos', '/estoque', '/licencas', '/colaboradores', '/usuarios', '/agentes', '/configuracoes?aba=fabricantes'];

for (const largura of [375, 768]) {
  test(`com ${largura}px, nenhuma lista rola de lado`, async ({ page, request }) => {
    await criarPosto(request, `Posto de nome comprido para a moldura estreita ${Date.now()}`);
    await page.setViewportSize({ width: largura, height: 900 });

    for (const lista of LISTAS) {
      await page.goto(lista);
      const moldura = page.locator('table').first().locator('..');
      await expect(page.getByRole('columnheader').first()).toBeVisible();
      expect(await moldura.evaluate((elemento) => elemento.scrollWidth - elemento.clientWidth), lista).toBeLessThanOrEqual(1);
    }
  });
}

// A soma das colunas de largura fixa passa da moldura só numa faixa estreita, entre um
// `aparece` e o seguinte: Agentes rolava entre 620 e 630px. A moldura percorre todas.
test('em nenhuma largura da moldura a lista rola de lado', async ({ page }) => {
  for (const lista of LISTAS) {
    await page.goto(lista);
    await expect(page.getByRole('columnheader').first()).toBeVisible();
    const rolam = await page.locator('table').first().locator('..').evaluate((elemento) => {
      const moldura = elemento as unknown as { style: { width: string }; scrollWidth: number; clientWidth: number };
      const larguras: number[] = [];
      for (let largura = 340; largura <= 1400; largura += 10) {
        moldura.style.width = `${largura}px`;
        if (moldura.scrollWidth - moldura.clientWidth > 1) larguras.push(largura);
      }
      return larguras;
    });
    expect(rolam, lista).toEqual([]);
  }
});

import { test, expect } from '@playwright/test';
import { criarAtivo, criarColaborador, vigiarConsole } from './helpers';

// A LINHA DA LIXEIRA ABRE A FICHA, SÓ PARA CONSULTA (BW): ver o histórico não custa uma
// restauração. As ações são Restaurar e, no `⋯`, Excluir de vez (DL). O servidor está
// provado em `tests/invariantes/ficha-da-lixeira.test.ts` e `exclusao-de-vez.test.ts`.

test('a linha da Lixeira abre a ficha com o histórico, e só Restaurar e Excluir de vez agem', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const id = await criarAtivo(request);
  const pessoa = await criarColaborador(request, `Histórico da Lixeira ${Date.now()}`);
  const { assetTag } = await (await request.get(`/api/assets/${id}`)).json() as { assetTag: string };

  const entrega = await request.post(`/api/assets/${id}/checkout`, { data: { targetType: 'PERSON', targetPersonId: pessoa } });
  expect(entrega.status()).toBe(201);
  expect((await request.post(`/api/assets/${id}/checkin`, { data: {} })).status()).toBe(200);
  expect((await request.delete(`/api/assets/${id}`)).status()).toBe(200);

  await page.goto(`/computadores?vista=trashed&busca=${assetTag}`);
  await page.getByRole('row', { name: new RegExp(assetTag) }).getByText(assetTag).click();
  await expect(page).toHaveURL(new RegExp(`/computadores/${id}`));

  await expect(page.getByText('Na lixeira', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entregar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await page.getByRole('button', { name: `Ações de ${assetTag}` }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Excluir de vez']);
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: /Histórico/ }).click();
  await expect(page.getByRole('tab', { name: /Histórico/ })).toContainText('2');
  await expect(page.getByRole('tabpanel').getByText(/Histórico da Lixeira/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByText('Computador restaurado.')).toBeVisible();
  await expect(page.getByText('Na lixeira', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible();

  conferirConsole();
});

test('Excluir de vez, da ficha da Lixeira, volta para a Lixeira e o computador some', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const id = await criarAtivo(request);
  const { assetTag } = await (await request.get(`/api/assets/${id}`)).json() as { assetTag: string };
  expect((await request.delete(`/api/assets/${id}`)).status()).toBe(200);

  await page.goto(`/computadores?vista=trashed&busca=${assetTag}`);
  await page.getByRole('row', { name: new RegExp(assetTag) }).getByText(assetTag).click();
  await expect(page).toHaveURL(new RegExp(`/computadores/${id}`));

  await page.getByRole('button', { name: `Ações de ${assetTag}` }).click();
  await page.getByRole('menuitem', { name: 'Excluir de vez' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir de vez' }).click();

  await expect(page.locator('[data-notificacao]')).toContainText('Computador excluído de vez.');
  await expect(page).toHaveURL(/\/computadores\?.*vista=trashed/);
  await expect(page.getByRole('row', { name: new RegExp(assetTag) })).toHaveCount(0);
  expect((await request.get(`/api/assets/${id}`)).status()).toBe(404);

  conferirConsole();
});

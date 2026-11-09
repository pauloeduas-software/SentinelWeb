import { test, expect } from '@playwright/test';
import { criarAtivo, criarColaborador, vigiarConsole } from './helpers';

// A LINHA DA LIXEIRA ABRE A FICHA, SÓ PARA CONSULTA (BW): ver o histórico não custa uma
// restauração. O servidor está provado em `tests/invariantes/ficha-da-lixeira.test.ts`.

test('a linha da Lixeira abre a ficha com o histórico, e só Restaurar age', async ({ page, request }) => {
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
  await expect(page.getByRole('button', { name: `Ações de ${assetTag}` })).toHaveCount(0);

  await page.getByRole('tab', { name: /Histórico/ }).click();
  await expect(page.getByRole('tab', { name: /Histórico/ })).toContainText('2');
  await expect(page.getByRole('tabpanel').getByText(/Histórico da Lixeira/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByText('Computador restaurado.')).toBeVisible();
  await expect(page.getByText('Na lixeira', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible();

  conferirConsole();
});

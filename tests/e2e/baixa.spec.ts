import { test, expect } from '@playwright/test';
import { criarAtivo, vigiarConsole } from './helpers';

// O MOTIVO DA BAIXA VEM DO CADASTRO (BE): o que se cria em Configurações aparece
// no formulário da baixa e vira o selo da ficha. O servidor já está provado em
// `tests/invariantes/motivo-da-baixa.test.ts`; aqui é o caminho pela tela.

test('o motivo criado em Configurações aparece ao dar baixa, e vira o selo da ficha', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const motivo = `Devolvido ao locador ${Date.now()}`;

  await page.goto('/configuracoes?aba=motivos');
  await page.getByRole('button', { name: 'Novo motivo de baixa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Novo motivo de baixa' })).toBeVisible();
  await page.getByLabel('Nome').fill(motivo);
  await page.getByRole('button', { name: /^Salvar/ }).click();
  await expect(page.getByText(motivo, { exact: true })).toBeVisible();

  const id = await criarAtivo(request);
  await page.goto(`/computadores/${id}`);
  await page.getByRole('button', { name: /^Ações de / }).first().click();
  await page.getByRole('menuitem', { name: 'Dar baixa' }).click();
  await expect(page.getByRole('heading', { name: 'Dar baixa no ativo' })).toBeVisible();

  // Sem motivo o formulário não sai: o campo nasce vazio, e não com o primeiro da lista.
  const seletor = page.getByRole('combobox');
  await expect(seletor).toHaveText('Selecione…');
  await seletor.click();
  await page.getByRole('option', { name: motivo }).click();
  await page.getByRole('button', { name: 'Dar baixa', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Dar baixa no ativo' })).toBeHidden();
  await expect(page.getByText(`${motivo} em`).first()).toBeVisible();

  conferirConsole();
});

// Sem `vigiarConsole`: o navegador escreve o 409 da recusa no console, e essa
// recusa é o que se quer ver aqui.
test('o motivo em uso mostra o número, recusa o Excluir e sai depois de reverter a baixa', async ({ page, request }) => {
  const motivo = `Motivo em uso ${Date.now()}`;
  const criado = await request.post('/api/retire-reasons', { data: { name: motivo } });
  const { id: retiredReasonId } = await criado.json() as { id: string };
  const id = await criarAtivo(request);
  expect((await request.post(`/api/assets/${id}/retire`, { data: { retiredReasonId } })).ok()).toBe(true);

  const excluir = async () => {
    await page.goto('/configuracoes?aba=motivos');
    await page.getByRole('searchbox').fill(motivo);
    await expect(page.getByRole('row', { name: new RegExp(motivo) })).toHaveCount(1);
    await page.getByRole('button', { name: `Ações de ${motivo}` }).click();
    await page.getByRole('menuitem', { name: 'Excluir' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click();
  };

  await excluir();
  await expect(page.getByText('Reverta a baixa desses computadores e exclua de novo.')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(motivo) }).getByRole('cell').nth(1)).toHaveText('1');

  await page.goto(`/computadores/${id}`);
  await page.getByRole('button', { name: /^Ações de / }).first().click();
  await page.getByRole('menuitem', { name: 'Reverter baixa' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reverter' }).click();
  await expect(page.getByText(`${motivo} em`)).toHaveCount(0);

  await excluir();
  await expect(page.getByRole('row', { name: new RegExp(motivo) })).toHaveCount(0);
});

test('o aviso da baixa e a observação ficam à vista em todas as abas', async ({ page, request }) => {
  const motivo = `Motivo do aviso ${Date.now()}`;
  const criado = await request.post('/api/retire-reasons', { data: { name: motivo } });
  const { id: retiredReasonId } = await criado.json() as { id: string };
  const id = await criarAtivo(request);
  expect((await request.post(`/api/assets/${id}/retire`, { data: { retiredReasonId, notes: 'Lote 2026/03' } })).ok()).toBe(true);

  await page.goto(`/computadores/${id}`);
  for (const aba of ['Responsáveis', 'Licenças', 'Componentes', 'Máquina', 'Histórico']) {
    await page.getByRole('tab', { name: aba }).click();
    await expect(page.getByText('Fora do patrimônio')).toBeVisible();
    await expect(page.getByText('Lote 2026/03')).toBeVisible();
  }
});

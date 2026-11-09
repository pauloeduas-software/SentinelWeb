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
  await expect(page.getByRole('heading', { name: 'Dar baixa no computador' })).toBeVisible();

  // Sem motivo o formulário não sai: o campo nasce vazio, e não com o primeiro da lista.
  const seletor = page.getByRole('combobox');
  await expect(seletor).toHaveText('Selecione…');
  await seletor.click();
  await page.getByRole('option', { name: motivo }).click();
  await page.getByRole('button', { name: 'Dar baixa', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Dar baixa no computador' })).toBeHidden();
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
    await expect(page.getByText('Baixado', { exact: true })).toBeVisible();
    await expect(page.getByText('Lote 2026/03')).toBeVisible();
  }
});

// A LINHA FAZ O QUE O `⋯` DA FICHA FAZ, e a vista Baixados conta o que existe nela (BV):
// o baixado não está Em uso nem Disponível, e o status dele é o motivo, sem o dia.
test('a linha dá baixa e reverte, e a vista Baixados troca os cartões pelos motivos', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const motivo = `Motivo do cartão ${Date.now()}`;
  const criado = await request.post('/api/retire-reasons', { data: { name: motivo } });
  const { id: motivoId } = await criado.json() as { id: string };
  const id = await criarAtivo(request);
  const { assetTag } = await (await request.get(`/api/assets/${id}`)).json() as { assetTag: string };
  const acoes = page.getByRole('button', { name: `Ações de ${assetTag}` });

  await page.goto(`/computadores?busca=${assetTag}`);
  await acoes.click();
  await expect(page.getByRole('menuitem', { name: 'Reverter baixa' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Dar baixa' }).click();
  const painel = page.locator('[data-painel-lateral]');
  await painel.getByRole('combobox').click();
  await page.getByRole('option', { name: motivo }).click();
  await painel.getByRole('button', { name: 'Dar baixa', exact: true }).click();
  await expect(page.getByText('Baixa registrada.')).toBeVisible();
  await expect(painel).toHaveCount(0);

  await page.goto('/computadores?vista=retired');
  const cartao = page.getByRole('button', { name: new RegExp(`^${motivo}`) });
  await expect(cartao).toContainText('1');
  await expect(cartao.locator('.bg-status-danger')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Total/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Em uso/ })).toHaveCount(0);

  await cartao.click();
  await expect(cartao).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(new RegExp(`vista=retired.*motivo=${motivoId}`));
  const linha = page.getByRole('row', { name: new RegExp(assetTag) });
  await expect(linha.getByText(motivo, { exact: true })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2);

  await page.getByRole('button', { name: /^Total/ }).click();
  await expect(page).not.toHaveURL(/motivo=/);
  await expect(page).toHaveURL(/vista=retired/);

  await page.goto(`/computadores/${id}`);
  await expect(page.getByRole('term').filter({ hasText: /^Status$/ }).locator('xpath=following-sibling::dd')).toHaveText(motivo);
  await expect(page.getByText(`${motivo} em `)).toBeVisible();

  await page.goto('/computadores?vista=trashed');
  await expect(page.getByRole('button', { name: /^Em uso/ })).toBeVisible();

  await page.goto(`/computadores?vista=retired&busca=${assetTag}`);
  await acoes.click();
  await expect(page.getByRole('menuitem', { name: 'Dar baixa' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Reverter baixa' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reverter' }).click();
  await expect(page.getByText('Baixa revertida.')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(assetTag) })).toHaveCount(0);

  conferirConsole();
});

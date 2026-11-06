import { test, expect } from '@playwright/test';
import { tituloDaPagina, vigiarConsole } from './helpers';

// MINHA CONTA (AR): abre pelo menu do usuário, no cabeçalho, e o nome se edita sem
// passar por Usuários. A troca de senha não entra aqui: ela derrubaria a sessão
// guardada que os outros specs reaproveitam (`auth.setup.ts`) — o que ela faz
// está provado por `tests/invariantes/senha-temporaria.test.ts`.
test('abre Minha conta pelo menu do usuário, troca o nome e devolve o que era', async ({ page }) => {
  const conferirConsole = vigiarConsole(page);
  await page.goto('/computadores');

  const menu = page.getByRole('button', { name: 'Menu do usuário' });
  await menu.click();
  await page.getByRole('menuitem', { name: 'Minha conta' }).click();
  await expect(page).toHaveURL(/\/conta$/);
  await expect(tituloDaPagina(page, 'Minha conta')).toBeVisible();

  const campo = page.getByLabel('Nome completo');
  const original = await campo.inputValue();

  await campo.fill(`${original} (E2E)`);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText('Nome salvo.');
  await menu.click();
  await expect(page.getByRole('menu')).toContainText(`${original} (E2E)`);
  await page.keyboard.press('Escape');

  // Devolve o nome: o banco do E2E é esvaziado a cada execução, mas o resto do
  // spec e os próximos testes da mesma execução não devem ver o nome trocado.
  await campo.fill(original);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText('Nome salvo.');

  conferirConsole();
});

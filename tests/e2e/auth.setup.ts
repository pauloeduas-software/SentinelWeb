import { test as setup, expect } from '@playwright/test';
import { SESSAO_DO_ADMIN } from '../../playwright.config';
import { ADMIN_DE_TESTE } from './helpers';

// O projeto `sessao` do playwright.config.ts: entra pela tela, como uma pessoa,
// e guarda o cookie para os specs do projeto `chromium`. É o único lugar da
// suíte que faz o login de verdade; `login.spec.ts` prova o login, mas começa
// sem sessão por conta própria.

setup('entra como administrador e guarda a sessão', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(ADMIN_DE_TESTE.email);
  await page.getByLabel('Senha', { exact: true }).fill(ADMIN_DE_TESTE.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // A raiz manda para /computadores: é a prova de que a sessão abriu.
  await expect(page).toHaveURL(/\/computadores$/);
  await page.context().storageState({ path: SESSAO_DO_ADMIN });
});

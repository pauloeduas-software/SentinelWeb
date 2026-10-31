import { test, expect } from '@playwright/test';
import { ADMIN_DE_TESTE, tituloDaPagina } from './helpers';

// Sem a sessão guardada pelo auth.setup.ts: este arquivo prova o próprio login,
// então cada teste começa como quem acabou de abrir o navegador.
test.use({ storageState: { cookies: [], origins: [] } });

test('sem sessão, a página protegida manda para o login', async ({ page }) => {
  await page.goto('/computadores');
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

test('senha errada fica no login, com a mesma frase para e-mail e senha', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(ADMIN_DE_TESTE.email);
  await page.getByLabel('Senha', { exact: true }).fill('nao-e-a-senha');
  await page.getByRole('button', { name: 'Entrar' }).click();

  // A frase não diz qual dos dois errou: dizer "senha" confirmaria o e-mail.
  await expect(page.getByText('E-mail ou senha inválidos.')).toBeVisible();
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

test('e-mail e senha certos abrem o painel em Computadores', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(ADMIN_DE_TESTE.email);
  await page.getByLabel('Senha', { exact: true }).fill(ADMIN_DE_TESTE.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL(/\/computadores$/);
  await expect(tituloDaPagina(page, 'Computadores')).toBeVisible();
});

test('a sessão que cai numa página volta para ela depois do login', async ({ page }) => {
  await page.goto('/licencas');
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await page.getByLabel('E-mail').fill(ADMIN_DE_TESTE.email);
  await page.getByLabel('Senha', { exact: true }).fill(ADMIN_DE_TESTE.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL(/\/licencas$/);
  await expect(tituloDaPagina(page, 'Licenças')).toBeVisible();
});

test('depois do Sair, o próximo login começa pela raiz, e não pela tela de quem saiu', async ({ page }) => {
  const entrar = async () => {
    await page.getByLabel('E-mail').fill(ADMIN_DE_TESTE.email);
    await page.getByLabel('Senha', { exact: true }).fill(ADMIN_DE_TESTE.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
  };
  await page.goto('/licencas');
  await entrar();
  await expect(page).toHaveURL(/\/licencas$/);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await entrar();
  await expect(page).toHaveURL(/\/computadores$/);
});

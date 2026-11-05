import { test, expect } from '@playwright/test';
import { tituloDaPagina, vigiarConsole } from './helpers';

// Toda página do menu, na ordem do menu (src/components/navegacao.ts).
// Página nova entra aqui: é a lista que diz o que o painel tem.
const PAGINAS = [
  'Computadores',
  'Postos',
  'Estoque',
  'Licenças',
  'Descobertas',
  'Colaboradores',
  'Configurações',
  'Usuários',
];

// Um teste só, e não um por página, de propósito: o que ele prova é a
// NAVEGAÇÃO — sair de uma página para a outra pelo link, com o estado da
// anterior ainda montado. Oito `goto` separados provariam oito carregamentos
// frios, que é o que o build já garante.
test('cada página do menu abre pelo link, com o título e sem erro no console', async ({ page }) => {
  const conferirConsole = vigiarConsole(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/computadores$/);

  const menu = page.getByRole('navigation');
  for (const nome of PAGINAS) {
    await menu.getByRole('link', { name: nome, exact: true }).click();
    await expect(tituloDaPagina(page, nome)).toBeVisible();
  }

  conferirConsole();
});

// Sem a rota `*` do `Layout` (src/App.tsx), a moldura abria com o conteúdo em branco.
test('endereço que não existe volta para a raiz', async ({ page }) => {
  await page.goto('/computadorez');
  await expect(page).toHaveURL(/\/computadores$/);
  await expect(tituloDaPagina(page, 'Computadores')).toBeVisible();
});

// O tema escolhido no menu do usuário vale agora e depois do F5, sem depender do
// sistema operacional: o `index.html` o aplica antes do primeiro quadro.
test('o tema escolhido fica depois de recarregar', async ({ page }) => {
  await page.goto('/computadores');
  await page.getByRole('button', { name: 'Menu do usuário' }).click();
  await page.getByRole('button', { name: 'Claro' }).click();

  await page.getByRole('button', { name: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('button', { name: 'Menu do usuário' }).click();
  await page.getByRole('button', { name: 'Claro' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

// Na primeira entrada vale o do sistema, e ele fica: mudar o sistema depois não
// muda o painel.
test('a primeira entrada segue o sistema, e depois o tema fica', async ({ page }) => {
  await page.goto('/computadores');
  await page.evaluate(() => localStorage.removeItem('sentinel.tema'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

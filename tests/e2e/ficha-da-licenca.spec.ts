import { test, expect } from '@playwright/test';
import {
  criarColaborador, criarLicenca, tituloDaPagina, vigiarConsole,
} from './helpers';

// A FICHA DA LICENÇA É PÁGINA (BK), como a do item. O que é só dela é a aba Chaves, que
// existe quando a licença tem chave.

test('a linha abre a página da licença, e a seta volta com a busca', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Licença da ficha ${Date.now()}`;
  await criarLicenca(request, nome);

  await page.goto(`/licencas?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await expect(page).toHaveURL(/\/licencas\/[^/?]+$/);
  await expect(tituloDaPagina(page, nome)).toBeVisible();
  await expect(page.getByRole('main').getByText('3 compradas · 0 em uso · 3 livres')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('link', { name: 'Voltar para Licenças' }).click();
  await expect(page).toHaveURL(/\/licencas\?busca=/);
  await expect(page.getByRole('main').getByRole('searchbox')).toHaveValue(nome);

  conferirConsole();
});

test('a aba Chaves só existe com chave, e sem ela o endereço cai na primeira', async ({ page, request }) => {
  const comChave = await criarLicenca(request, `Licença com chave ${Date.now()}`, ['AAAA-1111']);
  const semChave = await criarLicenca(request, `Licença sem chave ${Date.now()}`);

  await page.goto(`/licencas/${comChave}?aba=chaves`);
  await expect(page.getByRole('tab', { name: /Chaves/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('AAAA-••••');

  await page.reload();
  await expect(page.getByRole('tabpanel')).toContainText('AAAA-••••');

  await page.goto(`/licencas/${semChave}?aba=chaves`);
  await expect(page.getByRole('tab', { name: /Com quem está/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /Chaves/ })).toHaveCount(0);
});

test('da ficha do colaborador, abre filtrado por ele, devolve e volta', async ({ page, request }) => {
  const nomeDaLicenca = `Licença do colaborador ${Date.now()}`;
  const nome = `Pessoa da licença ${Date.now()}`;
  const licenca = await criarLicenca(request, nomeDaLicenca);
  const pessoa = await criarColaborador(request, nome);
  const entrega = await request.post(`/api/licenses/${licenca}/checkout`, { data: { assignedPersonId: pessoa } });
  expect(entrega.status()).toBe(201);

  await page.goto(`/colaboradores/${pessoa}?aba=licencas`);
  await page.getByRole('row', { name: new RegExp(nomeDaLicenca) }).click();
  await expect(page).toHaveURL(new RegExp(`/licencas/${licenca}\\?quem=`));
  const principal = page.getByRole('main');
  await expect(principal.getByRole('searchbox')).toHaveValue(nome);

  await principal.getByRole('button', { name: 'Devolver' }).click();
  await principal.getByRole('button', { name: 'Confirmar' }).click();
  await expect(principal.getByText('3 compradas · 0 em uso · 3 livres')).toBeVisible();

  await page.getByRole('link', { name: 'Voltar para Colaborador' }).click();
  await expect(page).toHaveURL(new RegExp(`/colaboradores/${pessoa}\\?aba=licencas$`));
  await expect(page.getByRole('tab', { name: /Licenças/ })).toHaveAttribute('aria-selected', 'true');
});

test('o link antigo leva à ficha, com a busca', async ({ page, request }) => {
  const nome = `Licença do link antigo ${Date.now()}`;
  const id = await criarLicenca(request, nome);

  await page.goto(`/licencas?licenca=${id}&quem=Laura`);
  await expect(page).toHaveURL(new RegExp(`/licencas/${id}\\?quem=Laura$`));
  await expect(tituloDaPagina(page, nome)).toBeVisible();
});

test('fechar o painel deixa na ficha', async ({ page, request }) => {
  const id = await criarLicenca(request, `Licença do painel ${Date.now()}`);
  const painel = page.locator('[data-painel-lateral]');

  await page.goto(`/licencas/${id}`);
  await page.getByRole('main').getByRole('button', { name: 'Entregar' }).click();
  await expect(painel).toBeVisible();
  await painel.getByRole('button', { name: 'Cancelar' }).click();
  await expect(painel).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/licencas/${id}$`));
});

test('excluir vai para a lista', async ({ page, request }) => {
  const nome = `Licença a excluir ${Date.now()}`;
  const id = await criarLicenca(request, nome);

  await page.goto(`/licencas/${id}`);
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click();

  await expect(page).toHaveURL(/\/licencas$/);
  await expect(page.locator('[data-notificacao]')).toContainText('Licença excluída.');
});

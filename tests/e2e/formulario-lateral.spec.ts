import { test, expect, type Locator, type Page } from '@playwright/test';
import { criarAtivo } from './helpers';

// COMO SE SAI DO PAINEL DOS FORMULÁRIOS (BG): clicar fora, Esc e o X fecham, e
// perguntam antes se a pessoa mexeu em algo. O painel é um só: o que vale em
// Categorias vale nos outros.

const NOVA_CATEGORIA = { name: 'Nova categoria', exact: true };

function painel(page: Page): Locator {
  return page.locator('[data-painel-lateral]');
}

function pergunta(page: Page): Locator {
  return page.getByRole('alertdialog');
}

/** No véu, à esquerda do painel. */
async function clicarFora(page: Page): Promise<void> {
  await page.mouse.click(20, 300);
}

async function abrirNovaCategoria(page: Page): Promise<void> {
  await page.goto('/configuracoes');
  await page.getByRole('button', NOVA_CATEGORIA).click();
  await expect(painel(page)).toBeVisible();
}

test('sem alteração, clicar fora, Esc e o X fecham sem perguntar', async ({ page }) => {
  await abrirNovaCategoria(page);
  await clicarFora(page);
  await expect(painel(page)).toBeHidden();

  await page.getByRole('button', NOVA_CATEGORIA).click();
  await expect(painel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(painel(page)).toBeHidden();

  await page.getByRole('button', NOVA_CATEGORIA).click();
  await painel(page).getByRole('button', { name: 'Fechar' }).click();
  await expect(painel(page)).toBeHidden();
  await expect(pergunta(page)).toHaveCount(0);
});

test('com alteração, a pergunta guarda o que foi digitado, e Descartar fecha', async ({ page }) => {
  await abrirNovaCategoria(page);
  const nome = painel(page).getByLabel('Nome');
  await nome.fill('Digitado antes do clique errado');

  await clicarFora(page);
  await expect(pergunta(page)).toContainText('Descartar as alterações?');
  await pergunta(page).getByRole('button', { name: 'Continuar editando' }).click();
  await expect(pergunta(page)).toBeHidden();
  await expect(nome).toHaveValue('Digitado antes do clique errado');

  await page.keyboard.press('Escape');
  await pergunta(page).getByRole('button', { name: 'Continuar editando' }).click();
  await expect(pergunta(page)).toBeHidden();

  await painel(page).getByRole('button', { name: 'Fechar' }).click();
  await pergunta(page).getByRole('button', { name: 'Descartar' }).click();
  await expect(painel(page)).toBeHidden();

  // O véu das duas janelas saiu: a página volta a responder, e o formulário abre limpo.
  await page.getByRole('button', NOVA_CATEGORIA).click();
  await expect(nome).toHaveValue('');
});

test('Cancelar fecha direto, mesmo com alteração', async ({ page }) => {
  await abrirNovaCategoria(page);
  await painel(page).getByLabel('Nome').fill('Desisti');
  await painel(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(painel(page)).toBeHidden();
  await expect(pergunta(page)).toHaveCount(0);
});

test('abrir para editar e sair sem mexer não pergunta', async ({ page, request }) => {
  const nome = `Categoria só olhada ${Date.now()}`;
  const criada = await request.post('/api/categories', { data: { name: nome, type: 'ASSET' } });
  expect(criada.status()).toBe(201);
  await page.goto(`/configuracoes?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await expect(painel(page).getByLabel('Nome')).toHaveValue(nome);

  await clicarFora(page);
  await expect(painel(page)).toBeHidden();
  await expect(pergunta(page)).toHaveCount(0);
});

test('no seletor aberto, o clique fora fecha só ele, e só escolher conta como alteração', async ({ page }) => {
  await page.goto('/usuarios');
  await page.getByRole('button', { name: 'Novo usuário', exact: true }).click();
  const cargo = painel(page).getByRole('combobox');
  const busca = page.getByPlaceholder('Buscar cargo…');

  await cargo.click();
  await busca.fill('Super');
  await clicarFora(page);
  await expect(busca).toBeHidden();
  await expect(painel(page)).toBeVisible();

  await clicarFora(page);
  await expect(painel(page)).toBeHidden();
  await expect(pergunta(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Novo usuário', exact: true }).click();
  await cargo.click();
  await page.getByRole('option', { name: /Supervisor/ }).click();
  await expect(busca).toBeHidden();
  await clicarFora(page);
  await expect(pergunta(page)).toContainText('Descartar as alterações?');
});

test('trocar a opção do Segmentado conta como alteração', async ({ page, request }) => {
  const ativo = await criarAtivo(request);
  await page.goto(`/computadores/${ativo}`);
  await page.getByRole('button', { name: 'Entregar' }).click();
  await painel(page).getByRole('button', { name: 'Posto', exact: true }).click();

  await clicarFora(page);
  await expect(pergunta(page)).toContainText('Descartar as alterações?');
});

test('com a senha temporária na tela, pergunta mesmo sem alteração', async ({ page, request }) => {
  const nome = `Conta do painel ${Date.now()}`;
  const criada = await request.post('/api/users', { data: { name: nome, email: `painel.${Date.now()}@teste.local`, role: 'TECNICO' } });
  expect(criada.status()).toBe(201);
  await page.goto('/usuarios');
  await page.getByRole('searchbox').fill(nome);
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: 'Gerar senha temporária' }).click();
  await pergunta(page).getByRole('button', { name: 'Gerar' }).click();
  // Pelo DOM: o painel que abre esconde do papel a pergunta que ainda está saindo.
  await expect(page.locator('[role="alertdialog"]')).toHaveCount(0);
  const copiar = painel(page).getByRole('button', { name: 'Copiar', exact: true });
  await expect(copiar).toBeVisible();

  await clicarFora(page);
  await expect(pergunta(page)).toContainText('Fechar sem guardar a senha?');
  await pergunta(page).getByRole('button', { name: 'Continuar aqui' }).click();
  await expect(pergunta(page)).toBeHidden();
  await expect(copiar).toBeVisible();

  await clicarFora(page);
  await pergunta(page).getByRole('button', { name: 'Fechar' }).click();
  await expect(painel(page)).toBeHidden();
});

test('enquanto salva, clicar fora não faz nada', async ({ page }) => {
  await abrirNovaCategoria(page);
  let liberar = () => undefined as void;
  const resposta = new Promise<void>((resolve) => { liberar = resolve; });
  await page.route('**/api/categories', async (rota) => {
    if (rota.request().method() === 'POST') await resposta;
    await rota.continue();
  });

  await painel(page).getByLabel('Nome').fill(`Categoria sem pressa ${Date.now()}`);
  await painel(page).getByRole('button', { name: /^Salvar/ }).click();
  await expect(painel(page).getByRole('button', { name: 'Salvando…' })).toBeVisible();

  await clicarFora(page);
  await expect(pergunta(page)).toHaveCount(0);
  await expect(painel(page)).toBeVisible();

  liberar();
  await expect(painel(page)).toBeHidden();
});

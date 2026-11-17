import { test, expect } from '@playwright/test';
import { criarAtivo, criarPosto, tituloDaPagina, vigiarConsole } from './helpers';
import { prisma } from '../../server/infra/database/prismaClient';

// AGENTES PELA TELA (DC a DF): o Vincular da lista e da ficha, as vistas e o link
// morto. A regra do vínculo e a recusa são do servidor (`tests/descoberta/`); aqui
// se prova que a tela leva a pessoa até elas.

/** Uma máquina sem computador, como o handshake a deixaria. Devolve o id. */
async function criarMaquina(hostname: string, dados: { lastSeen?: Date } = {}): Promise<string> {
  // A máquina nasce do handshake do agente, que o navegador não faz: vai direto ao banco.
  const { id } = await prisma.endpoint.create({
    data: { hwid: `hw-${hostname}`, hostname, osVersion: 'Windows 11', status: 'OFFLINE', ...dados },
  });
  return id;
}

async function etiquetaDe(request: Parameters<typeof criarAtivo>[0], id: string): Promise<string> {
  return ((await (await request.get(`/api/assets/${id}`)).json()) as { assetTag: string }).assetTag;
}

test('a ficha diz qual computador a máquina parece ser, e o Vincular da lista abre com ele escolhido', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const hostname = `NB-NOME-${Date.now()}`;
  const ativo = await criarAtivo(request, { name: hostname });
  const assetTag = await etiquetaDe(request, ativo);
  const principal = page.getByRole('main');
  const painel = page.locator('[data-painel-lateral]');

  // A dica mora na ficha, acima das abas; a lista fica com o traço (DI).
  const maquina = await criarMaquina(hostname);
  await page.goto(`/agentes/${maquina}`);
  await expect(principal.getByText(`Ela tem o mesmo nome que ${assetTag}`)).toBeVisible();

  await page.goto(`/agentes?vista=sem&busca=${hostname}`);
  const linha = principal.getByRole('row', { name: new RegExp(hostname) });
  await expect(linha).not.toContainText(assetTag);

  await principal.getByRole('button', { name: `Ações de ${hostname}` }).click();
  await page.getByRole('menuitem', { name: 'Vincular a um computador' }).click();
  await expect(painel.getByRole('combobox', { name: 'Computador' })).toContainText(assetTag);
  await painel.getByRole('button', { name: 'Vincular', exact: true }).click();

  await expect(page.getByText('Máquina vinculada.')).toBeVisible();
  await expect(painel).toHaveCount(0);
  await expect(linha).toHaveCount(0);

  await principal.getByRole('button', { name: /Com computador/ }).click();
  await expect(principal.getByRole('row', { name: new RegExp(hostname) })).toContainText(assetTag);

  conferirConsole();
});

test('na ficha, o Vincular e entregar liga a máquina e põe o computador no posto', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const sufixo = Date.now();
  const hostname = `NB-POSTO-${sufixo}`;
  const nomeDoPosto = `Posto do agente ${sufixo}`;
  const posto = await criarPosto(request, nomeDoPosto);
  const assetTag = await etiquetaDe(request, await criarAtivo(request));
  const maquina = await criarMaquina(hostname);
  const principal = page.getByRole('main');
  const aba = principal.getByRole('tabpanel');
  const painel = page.locator('[data-painel-lateral]');

  await page.goto(`/agentes/${maquina}`);
  await expect(aba.getByText('Esta máquina não está vinculada a um computador.')).toBeVisible();
  await principal.getByRole('button', { name: 'Vincular a um computador' }).first().click();

  await painel.getByRole('combobox', { name: 'Computador' }).click();
  await page.getByPlaceholder('Buscar…').fill(assetTag);
  await page.getByRole('option', { name: new RegExp(assetTag) }).click();
  await painel.getByRole('combobox', { name: 'E entregar ao posto' }).click();
  await page.getByPlaceholder('Buscar…').fill(String(sufixo));
  await page.getByRole('option', { name: nomeDoPosto }).click();
  await painel.getByRole('button', { name: 'Vincular e entregar' }).click();

  await expect(page.getByText('Máquina vinculada e computador entregue.')).toBeVisible();
  await expect(aba.getByRole('row', { name: new RegExp(assetTag) })).toBeVisible();
  await expect(principal.getByRole('button', { name: 'Desvincular' })).toBeVisible();

  await page.goto(`/postos/${posto}?aba=computador`);
  await expect(aba.getByRole('row', { name: new RegExp(assetTag) })).toBeVisible();

  conferirConsole();
});

test('a máquina sem contato há mais de 30 dias fica só em Sumidos, com o Excluir', async ({ page }) => {
  const conferirConsole = vigiarConsole(page);
  const hostname = `NB-SUMIDA-${Date.now()}`;
  await criarMaquina(hostname, { lastSeen: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) });
  const principal = page.getByRole('main');

  await page.goto(`/agentes?vista=sem&busca=${hostname}`);
  await expect(principal.getByText('Nenhuma máquina encontrada', { exact: false })).toBeVisible();

  await principal.getByRole('button', { name: /Sumidos/ }).click();
  await expect(principal.getByRole('row', { name: new RegExp(hostname) })).toBeVisible();
  await principal.getByRole('button', { name: `Ações de ${hostname}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Vincular a um computador' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Excluir' })).toBeVisible();

  conferirConsole();
});

test('o link de uma máquina que não existe avisa e leva de volta à lista', async ({ page }) => {
  await page.goto('/agentes/00000000-0000-4000-8000-000000000000');

  await expect(page.getByText('Máquina não encontrada.')).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para Agentes' }).click();
  await expect(tituloDaPagina(page, 'Agentes')).toBeVisible();
});

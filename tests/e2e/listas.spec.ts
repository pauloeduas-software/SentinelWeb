import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { criarAtivo, criarColaborador, criarItem, tituloDaPagina, vigiarConsole } from './helpers';

// TODA LISTA GUARDA O ESTADO NA URL (BB). Cada tela lê o mesmo `useListaNaUrl`, então o
// que se prova aqui é o caminho: o menu recomeça, a ficha volta como estava.

test('o menu recomeça a lista: a busca sai do campo e do endereço', async ({ page }) => {
  await page.goto('/estoque?busca=mouse');
  const busca = page.getByRole('searchbox');
  await expect(busca).toHaveValue('mouse');

  await page.getByRole('navigation').getByRole('link', { name: 'Estoque', exact: true }).click();

  await expect(page).toHaveURL(/\/estoque$/);
  await expect(busca).toHaveValue('');
});

test('a aba da ficha fica no endereço, e a seta volta para a lista como estava', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Pessoa da volta ${Date.now()}`;
  await criarColaborador(request, nome);

  await page.goto(`/colaboradores?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await expect(tituloDaPagina(page, nome)).toBeVisible();

  await page.getByRole('tab', { name: /Histórico/ }).click();
  await expect(page).toHaveURL(/\?aba=historico$/);

  await page.getByRole('link', { name: 'Voltar para Colaboradores' }).click();
  await expect(page).toHaveURL(/\/colaboradores\?busca=/);
  await expect(page.getByRole('searchbox')).toHaveValue(nome);
  await expect(page.locator('tbody tr')).toHaveCount(1);

  conferirConsole();
});

// A FALHA NÃO VIRA VAZIO (BB): "nenhuma entrega ainda" e "0 no total" são
// afirmações, e quem as lê acredita nelas. O erro vem do `page.route` porque é a tela que
// se prova aqui: a resposta do servidor já tem os testes dela.
const falhar = (page: Page, rota: string) => page.route(
  rota,
  (requisicao) => requisicao.fulfill({ status: 500, json: { error: 'Fora do ar no teste' } }),
);

test('na ficha do colaborador, a consulta que falha avisa e não diz que não há nada', async ({ page, request }) => {
  const nome = `Pessoa da falha ${Date.now()}`;
  await criarColaborador(request, nome);
  await falhar(page, '**/api/people/*/history*');
  await falhar(page, '**/api/people/*/occupancies');

  await page.goto(`/colaboradores?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await expect(tituloDaPagina(page, nome)).toBeVisible();

  const postos = page.getByRole('tab', { name: /Postos/ });
  await postos.click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar');
  await expect(page.getByText('Não é responsável por nenhum posto.')).toHaveCount(0);
  await expect(postos).toHaveText('Postos');

  const historico = page.getByRole('tab', { name: /Histórico/ });
  await historico.click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar');
  await expect(page.getByText('Nenhuma entrega, posto, licença nem estoque ainda.')).toHaveCount(0);
  await expect(historico).toHaveText('Histórico');
});

// O 409 quase sempre quer dizer que a tela está velha: outra pessoa fez antes. Relida a
// tela, ela para de oferecer o que o servidor acabou de recusar.
test('a devolução recusada porque outra pessoa já devolveu traz a ficha nova', async ({ page, request }) => {
  const ativo = await criarAtivo(request);
  const pessoa = await request.post('/api/people', { data: { name: `Pessoa da tela velha ${Date.now()}` } });
  const { id: targetPersonId } = (await pessoa.json()) as { id: string };
  const entrega = await request.post(`/api/assets/${ativo}/checkout`, { data: { targetType: 'PERSON', targetPersonId } });
  expect(entrega.status()).toBe(201);

  await page.goto(`/computadores/${ativo}`);
  await page.getByRole('button', { name: 'Devolver', exact: true }).click();
  const painel = page.locator('[data-painel-lateral]');
  await expect(painel).toBeVisible();

  const devolucao = await request.post(`/api/assets/${ativo}/checkin`, { data: {} });
  expect(devolucao.status()).toBe(200);

  await painel.getByRole('button', { name: 'Devolver', exact: true }).click();
  await expect(painel.getByRole('alert')).toBeVisible();
  await painel.getByRole('button', { name: 'Cancelar' }).click();

  await expect(page.getByRole('button', { name: 'Entregar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Devolver', exact: true })).toHaveCount(0);
});

test('o filtro de categoria que não carrega avisa, e não diz que o filtro ficou fora da lista', async ({ page }) => {
  await falhar(page, '**/api/categories/options*');
  await page.goto('/computadores?categoria=00000000-0000-4000-8000-000000000000');

  const filtro = page.getByRole('combobox', { name: 'Filtrar por categoria' });
  await expect(filtro).toHaveText('Filtro atual');
  await filtro.click();
  await expect(page.getByText('Não foi possível carregar as categorias.')).toBeVisible();
});

test('na ficha do computador, a consulta que falha avisa e não diz que não há nada', async ({ page, request }) => {
  const id = await criarAtivo(request);
  await falhar(page, '**/api/assets/*/history*');
  await falhar(page, '**/api/assets/*/machine');

  await page.goto(`/computadores/${id}?aba=historico`);
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar');
  await expect(page.getByText('Nenhuma entrega, licença nem componente ainda.')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Máquina' }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar');
  await expect(page.getByText('Nenhuma máquina vinculada a este ativo.')).toHaveCount(0);
});

test('o cartão sem resposta mostra traço, e não zero', async ({ page }) => {
  await falhar(page, '**/api/licenses/stats');
  await falhar(page, '**/api/licenses/alerts');

  await page.goto('/licencas');
  const principal = page.getByRole('main');
  await expect(principal.getByRole('button', { name: /Total/ })).toContainText('—');
  await expect(principal.getByText('Não foi possível conferir os prazos')).toBeVisible();
});

// OS CARTÕES (BT): Estoque e Colaboradores contam Ativos e Desativados, e clicar filtra a
// lista pelo endereço; clicar de novo desliga.
for (const { caminho, criar } of [
  { caminho: '/estoque', criar: criarItem },
  { caminho: '/colaboradores', criar: criarColaborador },
]) {
  test(`${caminho} abre com Total, Ativos e Desativados, e o cartão filtra`, async ({ page, request }) => {
    const conferirConsole = vigiarConsole(page);
    const nome = `Registro do cartão ${Date.now()}`;
    await criar(request, nome);

    await page.goto(caminho);
    const principal = page.getByRole('main');
    const desativados = principal.getByRole('button', { name: /Desativados/ });
    await expect(principal.getByRole('button', { name: /Total/ })).toBeVisible();
    await expect(principal.getByRole('button', { name: /Ativos/ })).toBeVisible();

    await desativados.click();
    await expect(page).toHaveURL(/status=desativados/);
    await expect(desativados).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('row', { name: new RegExp(nome) })).toHaveCount(0);

    await desativados.click();
    await expect(page).not.toHaveURL(/status=/);

    conferirConsole();
  });
}

test('Computadores abre com um cartão por tipo de status, e um status novo não vira cartão', async ({ page, request }) => {
  const nome = `Aguardando ${Date.now()}`;
  const status = await request.post('/api/status-labels', { data: { name: nome, type: 'PENDING' } });
  expect(status.status()).toBe(201);

  await page.goto('/computadores');
  const cartoes = page.getByRole('main').getByRole('button', { name: /^(Total|Em uso|Disponível|Inutilizável|Pendente)/ });
  await expect(cartoes).toHaveCount(5);
  await expect(page.getByRole('main').getByRole('button', { name: new RegExp(nome) })).toHaveCount(0);
});

test('Descobertas guarda a busca no endereço, e trocar de aba começa outra lista', async ({ page }) => {
  await page.goto('/descobertas?aba=sem');
  const busca = page.getByRole('main').getByRole('searchbox');
  await busca.fill('dell');
  await expect(page).toHaveURL(/busca=dell/);

  await page.reload();
  await expect(busca).toHaveValue('dell');

  await page.getByRole('tab', { name: /Vinculadas/ }).click();
  await expect(page).not.toHaveURL(/busca=/);
  await expect(busca).toHaveValue('');
});

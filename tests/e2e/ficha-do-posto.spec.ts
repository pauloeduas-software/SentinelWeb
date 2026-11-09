import { test, expect, type APIRequestContext } from '@playwright/test';
import { criarAtivo, criarColaborador, criarPosto, tituloDaPagina, vigiarConsole } from './helpers';
import { prisma } from '../../server/infra/database/prismaClient';

// A FICHA DO POSTO É PÁGINA, e a lista continua como estava na volta: o recorte, a
// página e a busca moram na URL dela (`usePostos`). O servidor não entra aqui: o
// que se prova é o caminho de ida e volta.

/** Um computador entregue a um posto novo, sem ninguém nele. */
async function computadorNoPosto(request: APIRequestContext, nome: string, checkoutNotes?: string) {
  const posto = await criarPosto(request, nome);
  const ativo = await criarAtivo(request);
  const { assetTag } = await (await request.get(`/api/assets/${ativo}`)).json() as { assetTag: string };
  const entrega = await request.post(`/api/assets/${ativo}/checkout`, {
    data: { targetType: 'WORKSTATION', targetWorkstationId: posto, checkoutNotes },
  });
  expect(entrega.status()).toBe(201);
  return { posto, ativo, assetTag };
}

test('a linha abre a página do posto, e a seta volta com o cartão escolhido', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Mesa da ficha ${Date.now()}`;
  await criarPosto(request, nome);

  await page.goto('/postos');
  const semUso = page.getByRole('main').getByRole('button', { name: /Sem uso/ });
  await semUso.click();
  await expect(page).toHaveURL(/\?status=sem-uso$/);

  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await expect(page).toHaveURL(/\/postos\/[^/?]+$/);
  await expect(tituloDaPagina(page, nome)).toBeVisible();
  await expect(page.getByRole('tab', { name: /Responsáveis/ })).toBeVisible();
  await expect(page.getByText('Nenhum responsável por este posto agora.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('link', { name: 'Voltar para Postos' }).click();
  await expect(page).toHaveURL(/\/postos\?status=sem-uso$/);
  await expect(semUso).toHaveAttribute('aria-pressed', 'true');

  conferirConsole();
});

test('a busca volta no campo depois de abrir um posto', async ({ page, request }) => {
  const nome = `Mesa da busca ${Date.now()}`;
  await criarPosto(request, nome);

  await page.goto('/postos');
  const busca = page.getByRole('searchbox');
  await busca.pressSequentially(nome);
  await expect(page.locator('tbody tr')).toHaveCount(1);

  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await expect(tituloDaPagina(page, nome)).toBeVisible();

  await page.goBack();
  await expect(busca).toHaveValue(nome);
  await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('duas trocas seguidas na lista valem as duas', async ({ page }) => {
  await page.goto('/postos?status=ocupados&busca=mesa');
  const principal = page.getByRole('main');
  await expect(principal.getByRole('button', { name: /Ocupados/ })).toHaveAttribute('aria-pressed', 'true');

  // O clique e a limpeza no mesmo instante, antes de a lista desenhar de novo.
  await page.evaluate(`(() => {
    const botoes = [...document.querySelectorAll('main button[aria-pressed]')];
    botoes.find((botao) => botao.textContent.includes('Total')).click();
    const campo = document.querySelector('main input[type=search]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, '');
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);

  await expect(principal.getByRole('button', { name: /Ocupados/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page).not.toHaveURL(/status|busca/);
});

test('Editar na ficha salva e continua na ficha, com a nota no card', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Mesa editada ${Date.now()}`;
  await criarPosto(request, nome);

  await page.goto(`/postos?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await page.getByRole('button', { name: 'Editar' }).click();

  const formulario = page.getByRole('dialog');
  await formulario.getByLabel('Notas').fill('Perto da janela');
  await formulario.getByRole('button', { name: 'Salvar' }).click();

  await expect(formulario).toHaveCount(0);
  await expect(page.getByRole('main').getByText('Perto da janela')).toBeVisible();
  await expect(tituloDaPagina(page, nome)).toBeVisible();

  conferirConsole();
});

test('Excluir na ficha volta para a lista, sem o posto', async ({ page, request }) => {
  const nome = `Mesa excluída ${Date.now()}`;
  await criarPosto(request, nome);

  await page.goto(`/postos?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click();

  await expect(page).toHaveURL(/\/postos$/);
  await expect(page.getByRole('row', { name: new RegExp(nome) })).toHaveCount(0);
});

test('o computador do posto fica na lista, e a seta da ficha dele volta ao posto na aba Computador', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Mesa do computador ${Date.now()}`;
  const { posto, ativo, assetTag } = await computadorNoPosto(request, nome);

  await page.goto(`/computadores?busca=${assetTag}`);
  const linha = page.getByRole('row', { name: new RegExp(assetTag) });
  await expect(linha.getByText(`Local de ${nome}`)).toBeVisible();
  await expect(linha.getByText(`Posto ${nome}`)).toBeVisible();
  await expect(linha.getByText('Posto vago')).toHaveCount(0);

  await page.goto(`/postos/${posto}?aba=computador`);
  await expect(page.getByRole('button', { name: /^Ações de ATV-/ })).toHaveCount(0);
  await expect(page.getByRole('main').getByText(/devolução|máquina vinculada/)).toHaveCount(0);
  await page.getByRole('row', { name: new RegExp(assetTag) }).click();
  await expect(page).toHaveURL(new RegExp(`/computadores/${ativo}$`));
  await expect(page.getByRole('tab', { name: 'Responsáveis 1' })).toBeVisible();
  await expect(page.getByRole('main').getByText(`Posto ${nome}`)).toBeVisible();
  await page.getByRole('tab', { name: 'Responsáveis 1' }).click();
  await expect(page.getByRole('main').getByRole('listitem')).toContainText(nome);
  await expect(page.getByRole('main').getByText(/Posto vago/)).toHaveCount(0);

  await page.getByRole('link', { name: 'Voltar para Posto' }).click();
  await expect(page).toHaveURL(new RegExp(`/postos/${posto}\\?aba=computador$`));
  await expect(page.getByRole('tab', { name: /Computador/ })).toHaveAttribute('aria-selected', 'true');

  conferirConsole();
});

test('na lista, Responsáveis mostra o posto sem quem o ocupa, que fica pendurado nele na aba Responsáveis', async ({ page, request }) => {
  const nome = `Mesa ocupada ${Date.now()}`;
  const pessoa = `Pessoa de ${nome}`;
  const { posto, assetTag } = await computadorNoPosto(request, nome);
  const colaborador = await criarColaborador(request, pessoa);
  const ocupacao = await request.post(`/api/workstations/${posto}/occupants`, { data: { personId: colaborador } });
  expect(ocupacao.status()).toBe(201);

  await page.goto(`/computadores?busca=${assetTag}`);
  await expect(page.getByRole('columnheader', { name: 'Responsáveis' })).toBeVisible();
  const noPosto = page.getByRole('row', { name: new RegExp(assetTag) });
  await expect(noPosto.getByText(`Posto ${nome}`)).toBeVisible();
  await expect(noPosto.getByText(pessoa)).toHaveCount(0);

  // No card, o Responsável é só o posto. A aba Responsáveis, a primeira (BR), mostra a pessoa embaixo dele.
  await noPosto.click();
  const responsavelNoCard = page.getByRole('main').getByRole('definition').filter({ hasText: `Posto ${nome}` });
  await expect(responsavelNoCard).toBeVisible();
  await expect(responsavelNoCard).not.toContainText(pessoa);

  await page.getByRole('tab', { name: 'Responsáveis 1' }).click();
  await page.getByRole('button', { name: 'Devolver' }).click();
  const devolucao = page.getByRole('dialog');
  await expect(devolucao.getByText(`Posto ${nome}`)).toBeVisible();
  await expect(devolucao.getByText(pessoa)).toHaveCount(0);
  await page.keyboard.press('Escape');

  const item = page.getByRole('main').getByRole('listitem');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(nome);
  await expect(item).toContainText(pessoa);
  await expect(item.getByRole('link')).toHaveCount(0);
  await expect(page.getByText('Histórico de responsáveis')).toHaveCount(0);

  const direto = await criarAtivo(request);
  const entrega = await request.post(`/api/assets/${direto}/checkout`, {
    data: { targetType: 'PERSON', targetPersonId: colaborador },
  });
  expect(entrega.status()).toBe(201);
  const { assetTag: etiquetaDireta } = await (await request.get(`/api/assets/${direto}`)).json() as { assetTag: string };

  await page.goto(`/computadores?busca=${etiquetaDireta}`);
  const comAPessoa = page.getByRole('row', { name: new RegExp(etiquetaDireta) });
  await expect(comAPessoa.getByText(pessoa, { exact: true })).toBeVisible();
  await expect(comAPessoa.getByText(/Posto /)).toHaveCount(0);
});

test('em Postos, Responsáveis traz só o nome, Etiqueta a do computador, e o posto vago fica no Status', async ({ page, request }) => {
  const vago = `Mesa vaga ${Date.now()}`;
  const { assetTag } = await computadorNoPosto(request, vago);
  const ocupado = `Mesa com turno ${Date.now()}`;
  const { posto } = await computadorNoPosto(request, ocupado);
  const pessoas = ['Primeira', 'Segunda', 'Terceira', 'Quarta'].map((quem) => `${quem} de ${ocupado}`);
  const colocar = async (nome: string, turno: string) => {
    const colaborador = await criarColaborador(request, nome);
    const ocupacao = await request.post(`/api/workstations/${posto}/occupants`, { data: { personId: colaborador, shift: turno } });
    expect(ocupacao.status()).toBe(201);
  };

  await colocar(pessoas[0], 'A');
  await page.goto(`/postos?busca=${encodeURIComponent(ocupado)}`);
  const celula = page.getByRole('row', { name: new RegExp(ocupado) }).getByRole('cell').nth(2);
  await expect(celula).toHaveText(pessoas[0]);

  await colocar(pessoas[1], 'B');
  await page.reload();
  await expect(celula).toHaveText(pessoas.slice(0, 2).join(', '));

  await colocar(pessoas[2], 'C');
  await colocar(pessoas[3], 'D');
  await page.reload();
  await expect(celula).toHaveText(`${pessoas[0]}, ${pessoas[1]} +2`);
  await expect(celula).toHaveAttribute('title', pessoas.join(', '));

  await page.goto(`/postos?busca=${encodeURIComponent(vago)}`);
  const linha = page.getByRole('row', { name: new RegExp(vago) });
  await expect(linha.getByRole('cell').nth(2)).toHaveText('—');
  await expect(linha.getByRole('cell').nth(3)).toHaveText(assetTag);
  await expect(linha.getByRole('cell').nth(4)).toHaveText('Posto vago');

  await linha.click();
  await expect(page.getByRole('main').getByText(/Posto vago/)).toHaveCount(1);
});

test('depois de passar pelo computador, a seta do posto ainda volta à lista como estava', async ({ page, request }) => {
  const nome = `Mesa das duas setas ${Date.now()}`;
  const { posto, assetTag } = await computadorNoPosto(request, nome);

  await page.goto(`/postos?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('row', { name: new RegExp(nome) }).click();
  await expect(page).toHaveURL(new RegExp(`/postos/${posto}$`));
  await page.getByRole('tab', { name: /Computador/ }).click();
  await page.getByRole('row', { name: new RegExp(assetTag) }).click();

  await page.getByRole('link', { name: 'Voltar para Posto' }).click();
  await expect(page).toHaveURL(new RegExp(`/postos/${posto}\\?aba=computador$`));

  await page.getByRole('link', { name: 'Voltar para Postos' }).click();
  await expect(page).toHaveURL(/\/postos\?busca=/);
  await expect(page.getByRole('searchbox')).toHaveValue(nome);
});

test('o card não tem link: no computador, a linha do posto abre o posto, e a seta volta', async ({ page, request }) => {
  const nome = `Mesa da linha ${Date.now()}`;
  const { posto, ativo } = await computadorNoPosto(request, nome);

  await page.goto(`/computadores/${ativo}`);
  const principal = page.getByRole('main');
  await expect(principal.locator('dl').getByRole('link')).toHaveCount(0);

  await principal.getByRole('listitem').getByText(nome).click();
  await expect(page).toHaveURL(new RegExp(`/postos/${posto}$`));
  await expect(principal.locator('dl').getByRole('link')).toHaveCount(0);

  await page.getByRole('link', { name: 'Voltar para Computador' }).click();
  await expect(page).toHaveURL(new RegExp(`/computadores/${ativo}$`));
});

test('o computador que não abre oferece voltar ao posto de onde se veio', async ({ page, request }) => {
  const nome = `Mesa da ficha que falha ${Date.now()}`;
  const { posto, ativo, assetTag } = await computadorNoPosto(request, nome);
  await page.route(`**/api/assets/${ativo}`, (rota) => rota.fulfill({ status: 404, json: { error: 'Computador não encontrado.' } }));

  await page.goto(`/postos/${posto}?aba=computador`);
  await page.getByRole('row', { name: new RegExp(assetTag) }).click();

  await expect(tituloDaPagina(page, 'Computadores')).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para Posto' }).click();
  await expect(page).toHaveURL(new RegExp(`/postos/${posto}\\?aba=computador$`));
});

test('o ⋯ da linha do computador no posto: Editar avisa, Excluir recusa, Entregar trava e não há Devolver', async ({ page, request }) => {
  const nome = `Mesa do menu ${Date.now()}`;
  const { ativo, assetTag } = await computadorNoPosto(request, nome);

  await page.goto(`/computadores?busca=${assetTag}`);
  const linha = page.getByRole('row', { name: new RegExp(assetTag) });
  const acoes = page.getByRole('button', { name: `Ações de ${assetTag}` });
  const painel = page.locator('[data-painel-lateral]');

  await acoes.click();
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  await expect(painel.getByText(`Entregue ao posto ${nome}`)).toBeVisible();
  await painel.getByRole('button', { name: 'Cancelar' }).click();

  await acoes.click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByRole('alert')).toHaveText('Este computador está entregue e não pode ir para a lixeira. Faça a devolução antes.');
  await expect(linha).toBeVisible();

  await acoes.click();
  const entregar = page.getByRole('menuitem', { name: 'Entregar' });
  await expect(entregar).toHaveAttribute('aria-disabled', 'true');
  await expect(entregar).toHaveAttribute('title', 'Já entregue: devolva antes de entregar de novo');
  await expect(page.getByRole('menuitem', { name: 'Devolver' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await linha.click();
  await expect(page).toHaveURL(new RegExp(`/computadores/${ativo}`));
  await page.getByRole('tab', { name: 'Responsáveis 1' }).click();
  await page.getByRole('main').getByRole('button', { name: 'Devolver' }).click();
  await painel.getByRole('button', { name: 'Devolver', exact: true }).click();
  await expect(painel).toHaveCount(0);

  await page.getByRole('link', { name: 'Voltar para Computadores' }).click();
  await expect(linha.getByText(`Posto ${nome}`)).toHaveCount(0);
  await expect(linha.getByText(`Local de ${nome}`)).toHaveCount(0);
});

test('no computador, o Entregar trava quando já foi entregue, e a aba Responsáveis busca e devolve', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Mesa dos botões ${Date.now()}`;
  const { posto, ativo } = await computadorNoPosto(request, nome, 'Monitor extra junto');
  const pessoa = `Pessoa de ${nome}`;
  const colaborador = await criarColaborador(request, pessoa);
  const ocupacao = await request.post(`/api/workstations/${posto}/occupants`, { data: { personId: colaborador } });
  expect(ocupacao.status()).toBe(201);

  await page.goto(`/computadores/${ativo}`);
  const principal = page.getByRole('main');
  const entregar = principal.getByRole('button', { name: 'Entregar' });
  await expect(entregar).toBeDisabled();
  // Desabilitado, o botão não recebe o ponteiro: o motivo mora na caixa em volta dele.
  await expect(principal.getByTitle('Já entregue: devolva antes de entregar de novo')).toContainText('Entregar');
  // O card só entrega: o Devolver é um só, na linha da aba em que a ficha abre.
  await expect(principal.getByRole('button', { name: 'Devolver' })).toHaveCount(1);
  await expect(principal.getByRole('listitem').getByRole('button', { name: 'Devolver' })).toBeVisible();

  await expect(principal.getByText('1–1 de 1')).toBeVisible();
  const busca = principal.getByRole('searchbox');
  await busca.pressSequentially('ninguém assim');
  await expect(principal.getByText('Nenhum responsável com "ninguém assim" neste computador.')).toBeVisible();
  await expect(page).toHaveURL(/quem=/);
  await busca.fill(pessoa);
  const item = principal.getByRole('listitem');
  await expect(item).toContainText(nome);
  await expect(item).toContainText('Monitor extra junto');

  await page.reload();
  await expect(busca).toHaveValue(pessoa);

  await item.getByRole('button', { name: 'Devolver' }).click();
  const painel = page.locator('[data-painel-lateral]');
  await painel.getByRole('button', { name: 'Devolver', exact: true }).click();
  await expect(painel).toHaveCount(0);
  await expect(entregar).toBeEnabled();
  await expect(item).toHaveCount(0);

  conferirConsole();
});

test('a aba Responsáveis do posto busca, corrige o turno e encerra na própria linha', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Mesa da aba ${Date.now()}`;
  const posto = await criarPosto(request, nome);
  const [manha, tarde] = ['Manhã', 'Tarde'].map((turno) => `Pessoa da ${turno} de ${nome}`);
  for (const [pessoa, shift] of [[manha, 'Manhã'], [tarde, 'Tarde']]) {
    const colaborador = await criarColaborador(request, pessoa);
    const ocupacao = await request.post(`/api/workstations/${posto}/occupants`, { data: { personId: colaborador, shift } });
    expect(ocupacao.status()).toBe(201);
  }

  await page.goto(`/postos/${posto}`);
  const principal = page.getByRole('main');
  const linhas = principal.getByRole('listitem');
  await expect(principal.getByRole('table')).toHaveCount(0);
  await expect(principal.getByText('1–2 de 2')).toBeVisible();
  await expect(linhas).toHaveCount(2);

  await principal.getByRole('searchbox').pressSequentially('manhã');
  await expect(linhas).toHaveCount(1);
  await expect(linhas).toContainText(manha);
  await expect(page).toHaveURL(/quem=/);

  await principal.getByRole('searchbox').fill('ninguém assim');
  await expect(principal.getByText('Nenhum responsável com "ninguém assim" neste posto.')).toBeVisible();
  await principal.getByRole('searchbox').fill('');

  const daTarde = linhas.filter({ hasText: tarde });
  await daTarde.getByRole('button', { name: 'Corrigir turno' }).click();
  const turno = page.getByLabel(`Turno de ${tarde}`);
  await turno.fill('Noite');
  await turno.press('Enter');
  await expect(daTarde).toContainText('· Noite');

  await daTarde.getByRole('button', { name: 'Registrar saída' }).click();
  await daTarde.getByRole('button', { name: 'Cancelar' }).click();
  await daTarde.getByRole('button', { name: 'Registrar saída' }).click();
  await daTarde.getByRole('button', { name: /^Confirmar/ }).click();
  await expect(linhas).toHaveCount(1);

  await principal.getByRole('tab', { name: /Histórico/ }).click();
  await principal.getByRole('button', { name: 'Adicionar ao posto' }).click();
  await expect(page.locator('[data-painel-lateral]')).toContainText('Adicionar ao posto');

  conferirConsole();
});

test('o Adicionar do ⋯ da lista abre o painel sem sair dela, e a linha já traz a pessoa', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Mesa do menu ${Date.now()}`;
  const pessoa = `Pessoa de ${nome}`;
  await criarPosto(request, nome);
  await criarColaborador(request, pessoa);

  await page.goto(`/postos?busca=${encodeURIComponent(nome)}`);
  await page.getByRole('button', { name: `Ações de ${nome}` }).click();
  await page.getByRole('menuitem', { name: 'Adicionar ao posto', exact: true }).click();

  const painel = page.locator('[data-painel-lateral]');
  await expect(painel).toContainText(nome);
  // A data da entrada vem com hoje, como a da entrega.
  await expect(painel.locator('input[type="date"]')).not.toHaveValue('');
  await painel.getByRole('combobox').click();
  await page.getByRole('option', { name: pessoa }).click();
  await painel.getByRole('button', { name: 'Adicionar', exact: true }).click();

  await expect(page.getByText('Responsável adicionado.')).toBeVisible();
  await expect(painel).toHaveCount(0);
  await expect(page).toHaveURL(/\/postos\?busca=/);
  await expect(page.getByRole('row', { name: new RegExp(nome) })).toContainText(pessoa);

  conferirConsole();
});

test('a Máquina é a mesma no posto e no computador, e quem desvincula é Descobertas', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const { posto, ativo, assetTag } = await computadorNoPosto(request, `Mesa da máquina ${Date.now()}`);
  const hostname = `NB-${ativo.slice(0, 8)}`;
  const principal = page.getByRole('main');
  const aba = principal.getByRole('tabpanel');

  await page.goto(`/postos/${posto}?aba=maquina`);
  await expect(aba.getByText('Nenhuma máquina vinculada a este posto.')).toBeVisible();

  // A máquina nasce do handshake do agente, que o navegador não faz: vai direto ao banco.
  await prisma.endpoint.create({
    data: { hwid: `hw-${ativo}`, hostname, osVersion: 'Windows 11', status: 'OFFLINE', assetId: ativo },
  });

  for (const caminho of [`/postos/${posto}?aba=maquina`, `/computadores/${ativo}?aba=maquina`]) {
    await page.goto(caminho);
    await expect(aba.getByRole('row', { name: new RegExp(hostname) })).toBeVisible();
    await expect(aba.getByText('Como está agora')).toBeVisible();
    await expect(aba.getByText(`hw-${ativo}`)).toBeVisible();
    await expect(aba.getByText(assetTag)).toHaveCount(0);
    await expect(aba.getByRole('button', { name: 'Desvincular' })).toHaveCount(0);
    await expect(aba.getByText('Especificações coletadas pelo agente')).toHaveCount(0);
    await expect(aba.getByText('Mudanças detectadas')).toHaveCount(0);
  }

  await page.goto(`/postos/${posto}?aba=computador`);
  await expect(aba.getByRole('row', { name: new RegExp(assetTag) })).toBeVisible();
  await expect(aba.getByText(`hw-${ativo}`)).toHaveCount(0);

  await page.goto(`/computadores/${ativo}?aba=maquina`);
  await aba.getByRole('row', { name: new RegExp(hostname) }).click();
  await expect(page).toHaveURL(new RegExp(`/descobertas\\?aba=com&busca=${hostname}$`));
  const linha = page.getByRole('row', { name: new RegExp(hostname) });
  await expect(linha).toContainText(assetTag);

  await page.getByRole('button', { name: `Ações de ${hostname}` }).click();
  await page.getByRole('menuitem', { name: 'Desvincular' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Desvincular' }).click();
  await expect(page.getByText('Máquina desvinculada.')).toBeVisible();
  await expect(linha).toHaveCount(0);

  await page.goto(`/computadores/${ativo}?aba=maquina`);
  await expect(aba.getByText('Nenhuma máquina vinculada a este computador.')).toBeVisible();

  conferirConsole();
});

test('o link de um posto que não existe avisa e leva de volta à lista', async ({ page }) => {
  await page.goto('/postos/00000000-0000-4000-8000-000000000000');

  await expect(page.getByText('Posto não encontrado.')).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para Postos' }).click();
  await expect(tituloDaPagina(page, 'Postos')).toBeVisible();
});

test('a aba Responsáveis mostra quem está agora, e o Histórico diz o que passou pelo posto', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const nome = `Mesa do histórico ${Date.now()}`;
  const { posto, ativo, assetTag } = await computadorNoPosto(request, nome);
  const ficou = `Quem ficou ${Date.now()}`;
  const saiu = `Quem saiu ${Date.now()}`;

  for (const pessoa of [ficou, saiu]) {
    const colaborador = await criarColaborador(request, pessoa);
    const ocupacao = await request.post(`/api/workstations/${posto}/occupants`, { data: { personId: colaborador } });
    expect(ocupacao.status()).toBe(201);
    if (pessoa === saiu) {
      const { id } = await ocupacao.json() as { id: string };
      expect((await request.delete(`/api/workstations/${posto}/occupants/${id}`, { data: {} })).status()).toBe(200);
    }
  }
  expect((await request.post(`/api/assets/${ativo}/checkin`, { data: {} })).status()).toBe(200);

  await page.goto(`/postos/${posto}`);
  await expect(page.getByText('Atuais', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('listitem').filter({ hasText: ficou })).toBeVisible();
  await expect(page.getByRole('main').getByRole('listitem').filter({ hasText: saiu })).toHaveCount(0);

  await page.getByRole('tab', { name: /Histórico/ }).click();
  await expect(page).toHaveURL(/aba=historico/);
  const principal = page.getByRole('main');
  await expect(principal.getByText(`Entrou no posto: ${ficou}`)).toBeVisible();
  await expect(principal.getByText(`Saiu do posto: ${saiu}`)).toBeVisible();
  await expect(principal.getByText(new RegExp(`Entregue: ${assetTag}`))).toBeVisible();
  await expect(principal.getByText(new RegExp(`Devolvido: ${assetTag}`))).toBeVisible();

  conferirConsole();
});

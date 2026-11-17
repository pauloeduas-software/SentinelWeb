import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarColaborador, criarFabricante, criarItemDeEstoque, criarLicenca, criarModelo, criarPosto,
  entregarLicenca, idsDoSeed,
} from '../helpers/fixtures';

// EXCLUIR DE VEZ, DA LIXEIRA (DL) — o colaborador e o computador.
//
// Dois passos, como o GLPI: excluir manda para a lixeira, e de lá a linha sai do
// banco. O passado não se perde: na regra do posto, as linhas já fechadas soltam
// o excluído e guardam o nome por escrito, e o histórico dos outros continua
// dizendo quem foi. Some a ficha dele.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId = '';
let contador = 0;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  modelId = await criarModelo(api, {
    categoriaId: seed.categoriaId, fabricanteId: await criarFabricante(api, 'Fabricante da Exclusão de Vez'),
  });
});

afterAll(async () => {
  await api.fechar();
});

const proximo = () => {
  contador += 1;
  return String(contador).padStart(3, '0');
};

const pessoa = (name: string) => criarColaborador(api, { name, email: `de-vez.${proximo()}@teste.local` });
const computador = (name: string) => criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name });

interface Historico<T> { rows: T[] }

/** Entrega e devolve: o passado que a exclusão de vez tem que preservar. */
async function entregarEDevolverComputador(ativoId: string, alvo: Record<string, string>) {
  expect((await api.post(`/api/assets/${ativoId}/checkout`, alvo)).status).toBe(201);
  expect((await api.post(`/api/assets/${ativoId}/checkin`, {})).status).toBe(200);
}

async function entregarEDevolverLicenca(alvo: { assignedPersonId: string } | { assignedAssetId: string }) {
  const licenca = await criarLicenca(api, { name: `Licença ${proximo()}`, categoryId: seed.categoriaLicencaId, seatsTotal: 1 });
  const entrega = await entregarLicenca(api, licenca.id, alvo);
  expect((await api.post(`/api/licenses/checkouts/${entrega.id}/checkin`, {})).status).toBe(200);
  return licenca.id;
}

async function entregarEDevolverEstoque(categoryId: string, alvo: Record<string, string>) {
  const item = await criarItemDeEstoque(api, { name: `Item ${proximo()}`, categoryId, qty: 1 });
  const entrega = await api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${item.id}/checkout`, alvo);
  expect(entrega.status).toBe(201);
  expect((await api.post(`/api/stock/checkouts/${entrega.body.unidades[0].id}/checkin`, {})).status).toBe(200);
  return item.id;
}

describe('o colaborador excluído de vez', () => {
  it('só sai da lixeira: fora dela, a rota é 404', async () => {
    const id = await pessoa('Fora da Lixeira');

    const { status, body } = await api.delete<{ error: string }>(`/api/people/${id}/permanent`);
    expect(status).toBe(404);
    expect(body.error).toBe('Colaborador não está na lixeira.');
  });

  it('fora da lixeira e com algo entregue, ainda é 404, e não o 409 de devolver', async () => {
    const id = await pessoa('Ativo com Computador');
    const ativo = await computador('Computador do Ativo');
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'PERSON', targetPersonId: id })).status).toBe(201);

    const { status, body } = await api.delete<{ error: string }>(`/api/people/${id}/permanent`);
    expect(status).toBe(404);
    expect(body.error).toBe('Colaborador não está na lixeira.');
  });

  it('é do Supervisor: o Técnico recebe 403', async () => {
    const id = await pessoa('Lixeira do Técnico');
    expect((await api.delete(`/api/people/${id}`)).status).toBe(200);

    const tecnico = await api.comoUsuario('TECNICO');
    expect((await tecnico.delete(`/api/people/${id}/permanent`)).status).toBe(403);
  });

  it('sai do banco, e o histórico do computador, do posto, da licença e do item continua com o nome', async () => {
    const id = await pessoa('Laura de Vez');
    const ativo = await computador('Notebook da Laura de Vez');
    const mesa = await criarPosto(api, { name: `Mesa da Laura de Vez ${proximo()}` });

    await entregarEDevolverComputador(ativo.id, { targetType: 'PERSON', targetPersonId: id });
    const ocupacao = await api.post<{ id: string }>(`/api/workstations/${mesa}/occupants`, { personId: id, shift: 'Manhã' });
    expect(ocupacao.status).toBe(201);
    expect((await api.delete(`/api/workstations/${mesa}/occupants/${ocupacao.body.id}`)).status).toBe(200);
    const licencaId = await entregarEDevolverLicenca({ assignedPersonId: id });
    const itemId = await entregarEDevolverEstoque(seed.categoriaEstoqueId, { targetType: 'PERSON', targetPersonId: id });

    expect((await api.delete(`/api/people/${id}`)).status).toBe(200);
    expect((await api.delete(`/api/people/${id}/permanent`)).status).toBe(200);

    expect(await prisma.person.findFirst({ where: { id, deletedAt: undefined } })).toBeNull();
    expect((await api.get(`/api/people/${id}`)).status).toBe(404);

    const doAtivo = await api.get<Historico<{ action: string; posse: { targetLabel: string | null } | null }>>(
      `/api/assets/${ativo.id}/history`,
    );
    const posses = doAtivo.body.rows.filter((evento) => evento.posse);
    expect(posses.length).toBe(2);
    for (const evento of posses) expect(evento.posse?.targetLabel).toBe('Laura de Vez');

    const doPosto = await api.get<Historico<{ ocupacao: { personId: string | null; personLabel: string } | null }>>(
      `/api/workstations/${mesa}/history`,
    );
    const ocupacoes = doPosto.body.rows.filter((evento) => evento.ocupacao);
    expect(ocupacoes.length).toBe(2);
    for (const evento of ocupacoes) expect(evento.ocupacao).toMatchObject({ personId: null, personLabel: 'Laura de Vez' });

    const daLicenca = await api.get<Historico<{ entrega: { alvo: string; alvoId: string | null; alvoLabel: string } }>>(
      `/api/licenses/${licencaId}/history`,
    );
    expect(daLicenca.body.rows).toHaveLength(2);
    for (const evento of daLicenca.body.rows) {
      expect(evento.entrega).toMatchObject({ alvo: 'PERSON', alvoId: null, alvoLabel: 'Laura de Vez' });
    }

    const doItem = await api.get<Historico<{ targetLabel: string }>>(`/api/stock/items/${itemId}/history`);
    expect(doItem.body.rows).toHaveLength(2);
    for (const evento of doItem.body.rows) expect(evento.targetLabel).toBe('Laura de Vez');
  });

  it('deixa a linha na auditoria, com o retrato', async () => {
    const id = await pessoa('Auditada de Vez');
    expect((await api.delete(`/api/people/${id}`)).status).toBe(200);
    expect((await api.delete(`/api/people/${id}/permanent`)).status).toBe(200);

    const linha = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: 'PURGE' } });
    expect(linha).toMatchObject({ entityType: 'Person', entityLabel: 'Auditada de Vez' });
    expect(linha.changes).toMatchObject({ name: 'Auditada de Vez' });
  });
});

describe('o computador excluído de vez', () => {
  it('só sai da lixeira: fora dela, a rota é 404', async () => {
    const ativo = await computador('Fora da Lixeira');

    const { status, body } = await api.delete<{ error: string }>(`/api/assets/${ativo.id}/permanent`);
    expect(status).toBe(404);
    expect(body.error).toBe('Computador não está na lixeira.');
  });

  it('é do Supervisor: o Técnico recebe 403', async () => {
    const ativo = await computador('Lixeira do Técnico');
    expect((await api.delete(`/api/assets/${ativo.id}`)).status).toBe(200);

    const tecnico = await api.comoUsuario('TECNICO');
    expect((await tecnico.delete(`/api/assets/${ativo.id}/permanent`)).status).toBe(403);
  });

  it('sai do banco, e o histórico do colaborador, do posto, da licença e do componente continua com a etiqueta', async () => {
    const ativo = await computador('Dell de Vez');
    const rotulo = `${ativo.assetTag} — Dell de Vez`;
    const id = await pessoa('Quem Usou o Dell');
    const mesa = await criarPosto(api, { name: `Mesa do Dell de Vez ${proximo()}` });

    await entregarEDevolverComputador(ativo.id, { targetType: 'PERSON', targetPersonId: id });
    await entregarEDevolverComputador(ativo.id, { targetType: 'WORKSTATION', targetWorkstationId: mesa });
    const licencaId = await entregarEDevolverLicenca({ assignedAssetId: ativo.id });
    const itemId = await entregarEDevolverEstoque(seed.categoriaComponenteId, { targetType: 'ASSET', targetAssetId: ativo.id });

    expect((await api.delete(`/api/assets/${ativo.id}`)).status).toBe(200);
    expect((await api.delete(`/api/assets/${ativo.id}/permanent`)).status).toBe(200);

    expect(await prisma.asset.findFirst({ where: { id: ativo.id, deletedAt: undefined } })).toBeNull();
    expect((await api.get(`/api/assets/${ativo.id}`)).status).toBe(404);

    const daPessoa = await api.get<Historico<{ fonte: string; posse: { assetId: string | null; assetLabel: string } | null }>>(
      `/api/people/${id}/history`,
    );
    const posses = daPessoa.body.rows.filter((evento) => evento.fonte === 'POSSE');
    expect(posses.length).toBe(2);
    for (const evento of posses) expect(evento.posse).toMatchObject({ assetId: null, assetLabel: rotulo });

    const doPosto = await api.get<Historico<{ posse: { assetId: string | null; assetLabel: string } | null }>>(
      `/api/workstations/${mesa}/history`,
    );
    const doComputador = doPosto.body.rows.filter((evento) => evento.posse);
    expect(doComputador.length).toBe(2);
    for (const evento of doComputador) expect(evento.posse).toMatchObject({ assetId: null, assetLabel: rotulo });

    const daLicenca = await api.get<Historico<{ entrega: { alvo: string; alvoId: string | null; alvoLabel: string } }>>(
      `/api/licenses/${licencaId}/history`,
    );
    expect(daLicenca.body.rows).toHaveLength(2);
    for (const evento of daLicenca.body.rows) {
      expect(evento.entrega).toMatchObject({ alvo: 'ASSET', alvoId: null, alvoLabel: rotulo });
    }

    const doItem = await api.get<Historico<{ targetLabel: string }>>(`/api/stock/items/${itemId}/history`);
    expect(doItem.body.rows).toHaveLength(2);
    for (const evento of doItem.body.rows) expect(evento.targetLabel).toBe(rotulo);
  });

  it('a posse que os dois tinham guarda os dois nomes, excluídos de vez um depois do outro', async () => {
    const ativo = await computador('Compartilhado de Vez');
    const id = await pessoa('Dona do Compartilhado');
    await entregarEDevolverComputador(ativo.id, { targetType: 'PERSON', targetPersonId: id });

    expect((await api.delete(`/api/people/${id}`)).status).toBe(200);
    expect((await api.delete(`/api/assets/${ativo.id}`)).status).toBe(200);
    const [daPessoa, doComputador] = await Promise.all([
      api.delete(`/api/people/${id}/permanent`),
      api.delete(`/api/assets/${ativo.id}/permanent`),
    ]);
    expect(daPessoa.status).toBe(200);
    expect(doComputador.status).toBe(200);

    const posse = await prisma.assignment.findFirstOrThrow({ where: { assetLabel: `${ativo.assetTag} — Compartilhado de Vez` } });
    expect(posse).toMatchObject({ assetId: null, targetPersonId: null, targetPersonName: 'Dona do Compartilhado' });
  });
});

describe('o banco: só a linha FECHADA fica sem o excluído', () => {
  it('a posse aberta não perde o computador nem o colaborador', async () => {
    const ativo = await computador('Aberto no Banco');
    const id = await pessoa('Com o Aberto no Banco');
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'PERSON', targetPersonId: id })).status).toBe(201);

    await expect(prisma.$executeRaw`
      UPDATE assignments SET "assetId" = NULL, "assetLabel" = 'ATV' WHERE "assetId" = ${ativo.id}::uuid
    `).rejects.toThrow(/assignments_ativo_presente/);
    await expect(prisma.$executeRaw`
      UPDATE assignments SET "targetPersonId" = NULL, "targetPersonName" = 'X' WHERE "assetId" = ${ativo.id}::uuid
    `).rejects.toThrow(/assignments_alvo_coerente/);

    expect((await api.post(`/api/assets/${ativo.id}/checkin`, {})).status).toBe(200);
  });

  it('a ocupação aberta não perde o colaborador', async () => {
    const id = await pessoa('Sentado no Banco');
    const mesa = await criarPosto(api, { name: `Mesa do Banco ${proximo()}` });
    const ocupacao = await api.post<{ id: string }>(`/api/workstations/${mesa}/occupants`, { personId: id });
    expect(ocupacao.status).toBe(201);

    await expect(prisma.$executeRaw`
      UPDATE workstation_occupants SET "personId" = NULL, "personName" = 'X' WHERE id = ${ocupacao.body.id}::uuid
    `).rejects.toThrow(/workstation_occupants_pessoa_presente/);

    expect((await api.delete(`/api/workstations/${mesa}/occupants/${ocupacao.body.id}`)).status).toBe(200);
  });
});

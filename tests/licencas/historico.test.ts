import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo, criarColaborador, criarLicenca, entregarLicenca } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';
// O vocabulário que a tela usa, importado para o teste provar que toda ação do
// histórico tem rótulo — não só o que o banco guarda.
import { ACOES_DA_LICENCA } from '../../src/pages/licencas/helpers/licenca.helper';
import type { EventoDaLicenca } from '../../src/domain/shared/license.types';

// O HISTÓRICO, SEPARADO POR ALVO (AA), e legível pela tela.
//
// A entrega ao computador aparece no histórico do COMPUTADOR, e não no da
// pessoa que responde por ele; a entrega à pessoa aparece no histórico DELA, e
// não no do computador que ela usa. A licença tem o seu: por onde passou — só
// movimentação, sem trilha de cadastro e edição.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

interface EventoDoAlvo { fonte: string; action: string; licenca: { licenseLabel: string; notes: string | null } | null }

async function daLicencaNoHistorico(url: string): Promise<EventoDoAlvo[]> {
  const { status, body } = await api.get<{ rows: EventoDoAlvo[] }>(url);
  expect(status).toBe(200);
  return body.rows.filter((evento) => evento.fonte === 'LICENCA');
}

describe('cada alvo vê só o que é dele', () => {
  it('a do computador fica no computador; a da pessoa, na pessoa — mesmo ela tendo o computador', async () => {
    const pessoa = await criarColaborador(api, { name: 'Marta Alves', email: 'marta@teste.local' });
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'PC da Marta' });
    // A Marta responde pelo computador: a posse liga os dois.
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'PERSON', targetPersonId: pessoa })).status).toBe(201);

    const doPc = await criarLicenca(api, { name: 'Windows do PC', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    const daMarta = await criarLicenca(api, { name: 'M365 da Marta', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    await entregarLicenca(api, doPc.id, { assignedAssetId: ativo.id }, 'instalado na formatação');
    await entregarLicenca(api, daMarta.id, { assignedPersonId: pessoa });

    const noAtivo = await daLicencaNoHistorico(`/api/assets/${ativo.id}/history`);
    expect(noAtivo.map((e) => e.licenca?.licenseLabel)).toEqual(['Windows do PC']);
    expect(noAtivo[0].licenca?.notes).toBe('instalado na formatação');

    const naPessoa = await daLicencaNoHistorico(`/api/people/${pessoa}/history`);
    expect(naPessoa.map((e) => e.licenca?.licenseLabel)).toEqual(['M365 da Marta']);
  });

  it('a devolução aparece como evento próprio', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'PC da devolução' });
    const licenca = await criarLicenca(api, {
      name: 'Licença do PC', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
    });
    const entrega = await entregarLicenca(api, licenca.id, { assignedAssetId: ativo.id });
    await api.post(`/api/licenses/checkouts/${entrega.id}/checkin`);

    const eventos = await daLicencaNoHistorico(`/api/assets/${ativo.id}/history`);
    expect(eventos.map((e) => [e.action, e.licenca?.licenseLabel])).toEqual([['CHECKIN', 'Licença do PC'], ['CHECKOUT', 'Licença do PC']]);
  });
});

describe('o histórico da licença é só movimentação', () => {
  let licencaId: string;

  beforeAll(async () => {
    const pessoa = await criarColaborador(api, { name: 'Nina Torres', email: 'nina@teste.local' });
    const outra = await criarColaborador(api, { name: 'Otávio Reis', email: 'otavio@teste.local' });
    const licenca = await criarLicenca(api, {
      name: 'Trilha', categoryId: cenario.categoriaLicencaId, seatsTotal: 4,
    });
    licencaId = licenca.id;

    await entregarLicenca(api, licencaId, { assignedPersonId: pessoa }, 'pedido do chamado 42');
    await entregarLicenca(api, licencaId, { assignedAssetId: cenario.ativo.id });
    const doOtavio = await entregarLicenca(api, licencaId, { assignedPersonId: outra });
    await api.post(`/api/licenses/checkouts/${doOtavio.id}/checkin`);
    // A edição não deixa rastro.
    await api.put(`/api/licenses/${licencaId}`, { name: 'Trilha (renomeada)', seatsTotal: 5 });
  });

  it('a entrega e a devolução trazem o NOME de quem recebeu e a observação', async () => {
    const { body } = await api.get<{ total: number; rows: EventoDaLicenca[] }>(`/api/licenses/${licencaId}/history`);

    expect(body.rows.map((e) => [e.action, e.entrega.alvoLabel])).toEqual(expect.arrayContaining([
      ['CHECKOUT', 'Nina Torres'],
      ['CHECKOUT', cenario.ativo.assetTag],
      ['CHECKOUT', 'Otávio Reis'],
      ['CHECKIN', 'Otávio Reis'],
    ]));
    const daNina = body.rows.find((e) => e.entrega.alvoLabel === 'Nina Torres');
    expect(daNina?.entrega.notes).toBe('pedido do chamado 42');
    expect(body.total).toBe(body.rows.length);
  });

  it('cadastro e edição não aparecem: só entregas e devoluções', async () => {
    const { body } = await api.get<{ rows: EventoDaLicenca[] }>(`/api/licenses/${licencaId}/history`);
    // Nina, computador e Otávio entregues; só o Otávio devolveu.
    expect(body.rows).toHaveLength(4);

    for (const evento of body.rows) {
      expect(Object.keys(ACOES_DA_LICENCA), `ação sem rótulo: ${evento.action}`).toContain(evento.action);
    }
  });

  it('a página sai do banco: nenhum evento some nem se repete entre as páginas', async () => {
    type Pagina = { total: number; rows: EventoDaLicenca[] };
    const url = `/api/licenses/${licencaId}/history`;
    const inteira = (await api.get<Pagina>(url)).body;
    const primeira = (await api.get<Pagina>(`${url}?perPage=3`)).body;
    const segunda = (await api.get<Pagina>(`${url}?perPage=3&page=2`)).body;

    expect([primeira.total, segunda.total]).toEqual([4, 4]);
    expect([primeira.rows.length, segunda.rows.length]).toEqual([3, 1]);
    expect([...primeira.rows, ...segunda.rows].map((e) => e.id)).toEqual(inteira.rows.map((e) => e.id));

    const instantes = inteira.rows.map((e) => new Date(e.at).getTime());
    expect(instantes).toEqual([...instantes].sort((a, b) => b - a));

    // A devolução do Otávio vem antes da entrega dele, mesmo no mesmo instante.
    const doOtavio = inteira.rows.filter((e) => e.entrega.alvoLabel === 'Otávio Reis').map((e) => e.action);
    expect(doOtavio).toEqual(['CHECKIN', 'CHECKOUT']);
  });

  it('a licença não grava nada na trilha de auditoria', async () => {
    expect(await prisma.activityLog.count({ where: { entityType: 'License' } })).toBe(0);
  });
});

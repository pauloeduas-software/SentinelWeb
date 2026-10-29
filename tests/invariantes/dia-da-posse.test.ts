import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, criarAtivo, criarColaborador, criarItemDeEstoque, criarLicenca, criarPosto, diaNoBrasil,
} from '../helpers/fixtures';

// O DIA DA ENTREGA E DA DEVOLUÇÃO DO COMPUTADOR (AM) — o molde da licença e do
// estoque: hoje por padrão, o passado para registrar o que já aconteceu, o
// futuro recusado. O dia passado é gravado ao meio-dia de Brasília, e o dia não
// antecede a compra do computador nem a posse anterior dele. A baixa e o
// começo da ocupação seguem o mesmo calendário.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api, ' do dia');
});

afterAll(async () => {
  await api.fechar();
});

interface Posse { assignment: { checkoutAt: string; checkinAt: string | null }; error: string }

/** O dia como as frases do servidor o escrevem: 'DD/MM/AAAA'. */
const naFrase = (dia: string) => dia.split('-').reverse().join('/');

const computador = () => criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });

const entregar = (assetId: string, corpo: Record<string, unknown> = {}) =>
  api.post<Posse>(`/api/assets/${assetId}/checkout`, { targetType: 'PERSON', targetPersonId: cenario.laura, ...corpo });

const devolver = (assetId: string, corpo: Record<string, unknown> = {}) =>
  api.post<Posse>(`/api/assets/${assetId}/checkin`, corpo);

describe('a entrega do computador', () => {
  it('aceita um dia passado, gravado ao meio-dia de Brasília; futuro é 422', async () => {
    const pc = await computador();

    const futura = await entregar(pc.id, { checkoutAt: diaNoBrasil(1) });
    expect(futura.status).toBe(422);
    expect(futura.body.error).toContain('não pode ser uma data futura');

    const antiga = await entregar(pc.id, { checkoutAt: diaNoBrasil(-30) });
    expect(antiga.status, antiga.body.error).toBe(201);
    expect(antiga.body.assignment.checkoutAt).toBe(`${diaNoBrasil(-30)}T15:00:00.000Z`);
  });

  it('não antecede a compra do computador; o próprio dia da compra passa', async () => {
    const pc = await computador();
    expect((await api.put(`/api/assets/${pc.id}`, { purchaseDate: diaNoBrasil(-5) })).status).toBe(200);

    const antes = await entregar(pc.id, { checkoutAt: diaNoBrasil(-6) });
    expect(antes.status).toBe(422);
    expect(antes.body.error).toBe(
      `A entrega (${diaNoBrasil(-6).split('-').reverse().join('/')}) não pode ser antes da compra de ${pc.assetTag} `
      + `(${diaNoBrasil(-5).split('-').reverse().join('/')}).`,
    );

    expect((await entregar(pc.id, { checkoutAt: diaNoBrasil(-5) })).status).toBe(201);
  });

  it('não volta para antes da última devolução; no dia dela passa, um milissegundo depois', async () => {
    const pc = await computador();
    expect((await entregar(pc.id, { checkoutAt: diaNoBrasil(-10) })).status).toBe(201);
    const devolucao = await devolver(pc.id, { checkinAt: diaNoBrasil(-4) });
    expect(devolucao.status).toBe(200);

    // Para outra pessoa, antes do dia em que voltou: o computador estaria com duas.
    const sobreposta = await entregar(pc.id, { targetPersonId: cenario.ana, checkoutAt: diaNoBrasil(-7) });
    expect(sobreposta.status).toBe(422);
    expect(sobreposta.body.error).toMatch(/^A entrega \(.+\) não pode ser antes da última devolução de .+ \(.+\)\.$/);

    const nova = await entregar(pc.id, { targetPersonId: cenario.ana, checkoutAt: diaNoBrasil(-4) });
    expect(nova.status).toBe(201);
    expect(new Date(nova.body.assignment.checkoutAt).getTime())
      .toBe(new Date(devolucao.body.assignment.checkinAt as string).getTime() + 1);
  });

  it('ao posto também, e sem dia é agora', async () => {
    const pc = await computador();
    const mesa = await criarPosto(api, { name: 'Mesa do dia' });
    const antes = Date.now();
    const agora = await entregar(pc.id, { targetType: 'WORKSTATION', targetPersonId: undefined, targetWorkstationId: mesa });
    expect(agora.status, agora.body.error).toBe(201);
    expect(new Date(agora.body.assignment.checkoutAt).getTime()).toBeGreaterThanOrEqual(antes - 1000);
  });
});

describe('a devolução do computador', () => {
  it('aceita um dia passado, mas nunca futuro nem antes da entrega; sem dia é hoje', async () => {
    const pc = await computador();
    expect((await entregar(pc.id, { checkoutAt: diaNoBrasil(-10) })).status).toBe(201);

    expect((await devolver(pc.id, { checkinAt: diaNoBrasil(1) })).status).toBe(422);

    const antes = await devolver(pc.id, { checkinAt: diaNoBrasil(-11) });
    expect(antes.status).toBe(422);
    expect(antes.body.error).toMatch(/^A devolução \(.+\) não pode ser antes da entrega \(.+\)\.$/);

    const passada = await devolver(pc.id, { checkinAt: diaNoBrasil(-3) });
    expect(passada.status).toBe(200);
    expect(passada.body.assignment.checkinAt).toBe(`${diaNoBrasil(-3)}T15:00:00.000Z`);

    const outro = await computador();
    expect((await entregar(outro.id)).status).toBe(201);
    const hoje = await devolver(outro.id);
    expect(hoje.status).toBe(200);
    expect(hoje.body.assignment.checkinAt).not.toBeNull();
  });

  it('no mesmo dia, não fica antes da hora real da entrega', async () => {
    const pc = await computador();
    const entrega = await entregar(pc.id);
    const devolucao = await devolver(pc.id, { checkinAt: diaNoBrasil(0) });
    expect(devolucao.status).toBe(200);
    expect(new Date(devolucao.body.assignment.checkinAt as string).getTime())
      .toBeGreaterThanOrEqual(new Date(entrega.body.assignment.checkoutAt).getTime());
  });
});

describe('as outras datas do computador e do posto', () => {
  it('a compra editada não vai para depois da primeira entrega', async () => {
    const pc = await computador();
    expect((await entregar(pc.id, { checkoutAt: diaNoBrasil(-10) })).status).toBe(201);

    const compra = await api.put<{ error: string }>(`/api/assets/${pc.id}`, { purchaseDate: diaNoBrasil(-9) });
    expect(compra.status).toBe(422);
    expect(compra.body.error).toContain(`não pode ser depois da primeira entrega de ${pc.assetTag}`);

    expect((await api.put(`/api/assets/${pc.id}`, { purchaseDate: diaNoBrasil(-10) })).status).toBe(200);
  });

  it('a baixa não antecede a última devolução, e sem dia é o dia de Brasília', async () => {
    const pc = await computador();
    expect((await entregar(pc.id, { checkoutAt: diaNoBrasil(-10) })).status).toBe(201);
    expect((await devolver(pc.id, { checkinAt: diaNoBrasil(-4) })).status).toBe(200);

    const antes = await api.post<{ error: string }>(`/api/assets/${pc.id}/retire`, {
      retiredReason: 'VENDIDO', retiredAt: diaNoBrasil(-5),
    });
    expect(antes.status).toBe(422);
    expect(antes.body.error).toMatch(/^A baixa \(.+\) não pode ser antes da última devolução de .+ \(.+\)\.$/);

    const hoje = await api.post<{ retiredAt: string; error: string }>(`/api/assets/${pc.id}/retire`, { retiredReason: 'VENDIDO' });
    expect(hoje.status, hoje.body.error).toBe(200);
    expect(hoje.body.retiredAt).toBe(`${diaNoBrasil(0)}T00:00:00.000Z`);
  });

  it('a baixa não antecede a compra, e a compra editada não vai para depois da baixa', async () => {
    const pc = await computador();
    expect((await api.put(`/api/assets/${pc.id}`, { purchaseDate: diaNoBrasil(-10) })).status).toBe(200);

    const antes = await api.post<{ error: string }>(`/api/assets/${pc.id}/retire`, {
      retiredReason: 'VENDIDO', retiredAt: diaNoBrasil(-20),
    });
    expect(antes.status).toBe(422);
    expect(antes.body.error).toBe(
      `A baixa (${diaNoBrasil(-20).split('-').reverse().join('/')}) não pode ser antes da compra de ${pc.assetTag} `
      + `(${diaNoBrasil(-10).split('-').reverse().join('/')}).`,
    );

    expect((await api.post(`/api/assets/${pc.id}/retire`, { retiredReason: 'VENDIDO', retiredAt: diaNoBrasil(-5) })).status).toBe(200);
    const compra = await api.put<{ error: string }>(`/api/assets/${pc.id}`, { purchaseDate: diaNoBrasil(-3) });
    expect(compra.status).toBe(422);
    expect(compra.body.error).toContain(`não pode ser depois da baixa de ${pc.assetTag}`);
    expect((await api.put(`/api/assets/${pc.id}`, { purchaseDate: diaNoBrasil(-5) })).status).toBe(200);
  });

  it('a baixa não antecede a devolução da licença nem a retirada do componente', async () => {
    const pc = await computador();
    const licenca = await criarLicenca(api, { name: 'Licença da baixa', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    const entrega = await api.post<{ id: string }>(`/api/licenses/${licenca.id}/checkout`, {
      assignedAssetId: pc.id, checkoutAt: diaNoBrasil(-20),
    });
    expect((await api.post(`/api/licenses/checkouts/${entrega.body.id}/checkin`, { checkinAt: diaNoBrasil(-5) })).status).toBe(200);

    const daLicenca = await api.post<{ error: string }>(`/api/assets/${pc.id}/retire`, {
      retiredReason: 'VENDIDO', retiredAt: diaNoBrasil(-10),
    });
    expect(daLicenca.status).toBe(422);
    expect(daLicenca.body.error).toMatch(/^A baixa \(.+\) não pode ser antes da última licença devolvida de .+ \(.+\)\.$/);

    const outro = await computador();
    const memoria = await criarItemDeEstoque(api, { name: 'Memória da baixa', categoryId: cenario.categoriaComponenteId, qty: 1 });
    const instalada = await api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${memoria.id}/checkout`, {
      targetType: 'ASSET', targetAssetId: outro.id, qty: 1, checkoutAt: diaNoBrasil(-20),
    });
    expect((await api.post(`/api/stock/checkouts/${instalada.body.unidades[0].id}/checkin`, { checkinAt: diaNoBrasil(-5) })).status).toBe(200);

    const doComponente = await api.post<{ error: string }>(`/api/assets/${outro.id}/retire`, {
      retiredReason: 'VENDIDO', retiredAt: diaNoBrasil(-10),
    });
    expect(doComponente.status).toBe(422);
    expect(doComponente.body.error).toMatch(/^A baixa \(.+\) não pode ser antes do último componente retirado de .+ \(.+\)\.$/);
    expect((await api.post(`/api/assets/${outro.id}/retire`, { retiredReason: 'VENDIDO', retiredAt: diaNoBrasil(-5) })).status).toBe(200);
  });

  it('a ocupação desde um dia passado fica ao meio-dia de Brasília; futura é 422', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa da ocupação do dia' });
    const pessoa = await criarColaborador(api, { name: 'Ocupa Desde', email: 'ocupa.desde@teste.local' });

    const futura = await api.post<{ error: string }>(`/api/workstations/${mesa}/occupants`, {
      personId: pessoa, startedAt: diaNoBrasil(1),
    });
    expect(futura.status).toBe(422);

    const antiga = await api.post<{ startedAt: string }>(`/api/workstations/${mesa}/occupants`, {
      personId: pessoa, startedAt: diaNoBrasil(-20),
    });
    expect(antiga.status).toBe(201);
    expect(antiga.body.startedAt).toBe(`${diaNoBrasil(-20)}T15:00:00.000Z`);
  });

  it('o fim da ocupação: dia passado ao meio-dia de Brasília, nunca futuro nem antes do início', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa do fim da ocupação' });
    const pessoa = await criarColaborador(api, { name: 'Sai Em', email: 'sai.em@teste.local' });
    const ocupacao = await api.post<{ id: string }>(`/api/workstations/${mesa}/occupants`, {
      personId: pessoa, startedAt: diaNoBrasil(-10),
    });
    const encerrar = (corpo: Record<string, unknown>) =>
      api.delete<{ endedAt: string; error: string }>(`/api/workstations/${mesa}/occupants/${ocupacao.body.id}`, corpo);

    expect((await encerrar({ endedAt: diaNoBrasil(1) })).status).toBe(422);
    const antes = await encerrar({ endedAt: diaNoBrasil(-11) });
    expect(antes.status).toBe(422);
    expect(antes.body.error).toBe(
      `O fim da ocupação (${naFrase(diaNoBrasil(-11))}) não pode ser antes do início (${naFrase(diaNoBrasil(-10))}).`,
    );

    const fim = await encerrar({ endedAt: diaNoBrasil(-3) });
    expect(fim.status).toBe(200);
    expect(fim.body.endedAt).toBe(`${diaNoBrasil(-3)}T15:00:00.000Z`);
  });

  it('a compra do computador não é futura', async () => {
    const pc = await computador();
    expect((await api.put(`/api/assets/${pc.id}`, { purchaseDate: diaNoBrasil(1) })).status).toBe(422);
    expect((await api.put(`/api/assets/${pc.id}`, { purchaseDate: diaNoBrasil(0) })).status).toBe(200);
  });

  it('a devolução pela ficha do posto leva o dia', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa da devolução do dia' });
    const pc = await computador();
    await api.post(`/api/assets/${pc.id}/checkout`, { targetType: 'WORKSTATION', targetWorkstationId: mesa, checkoutAt: diaNoBrasil(-6) });

    const devolvido = await devolver(pc.id, { targetWorkstationId: mesa, checkinAt: diaNoBrasil(-2) });
    expect(devolvido.status).toBe(200);
    expect(devolvido.body.assignment.checkinAt).toBe(`${diaNoBrasil(-2)}T15:00:00.000Z`);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste, type Resposta } from '../helpers/app';
import { cenarioDePosse, criarColaborador, criarLicenca, entregarLicenca } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// AS CORRIDAS — requisições SIMULTÂNEAS contra a mesma licença.
//
// A conta (em uso ≤ compradas, invariante 22) só se mantém porque
// a entrega, a edição, o Encerrar e a exclusão contam com a LICENÇA travada.
// Cada corrida aqui usa ALVOS DIFERENTES: com o mesmo alvo, a trava do alvo
// serializaria as requisições antes de chegarem à licença, e o teste passaria
// sem provar a trava que importa.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;
let pessoas: string[];

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
  pessoas = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    criarColaborador(api, { name: `Corredor ${i + 1}`, email: `corredor${i + 1}@teste.local` })));
});

afterAll(async () => {
  await api.fechar();
});

function placar(respostas: Resposta[]): Record<number, number> {
  const contagem: Record<number, number> = {};
  for (const { status } of respostas) contagem[status] = (contagem[status] ?? 0) + 1;
  return contagem;
}

function abertas(licenseId: string) {
  return prisma.licenseCheckout.count({ where: { licenseId, checkinAt: null } });
}

describe('oito entregas simultâneas, oito pessoas, três licenças compradas', () => {
  it('deixa passar exatamente TRÊS', async () => {
    const licenca = await criarLicenca(api, { name: 'Corrida das três', categoryId: cenario.categoriaLicencaId, seatsTotal: 3 });

    const respostas = await Promise.all(pessoas.map((pessoa) =>
      api.post(`/api/licenses/${licenca.id}/checkout`, { assignedPersonId: pessoa })));

    expect(placar(respostas)).toEqual({ 201: 3, 409: 5 });
    expect(await abertas(licenca.id)).toBe(3);
  });
});

describe('a edição contra a entrega', () => {
  it('reduzir enquanto entregam nunca deixa a conta passar do contrato', async () => {
    const licenca = await criarLicenca(api, { name: 'Corrida da redução', categoryId: cenario.categoriaLicencaId, seatsTotal: 4 });
    await entregarLicenca(api, licenca.id, { assignedPersonId: pessoas[0] });

    const [reducao, ...entregas] = await Promise.all([
      api.put(`/api/licenses/${licenca.id}`, { seatsTotal: 2 }),
      ...pessoas.slice(1, 4).map((pessoa) => api.post(`/api/licenses/${licenca.id}/checkout`, { assignedPersonId: pessoa })),
    ]);

    const { body } = await api.get<{ seatsTotal: number; emUso: number }>(`/api/licenses/${licenca.id}`);
    expect(body.emUso).toBeLessThanOrEqual(body.seatsTotal);
    expect(await abertas(licenca.id)).toBe(body.emUso);
    // A redução passou e sobrou espaço para UMA entrega, ou foi recusada porque
    // as entregas chegaram antes. As duas ordens são válidas; a conta estourada não.
    expect([200, 409]).toContain(reducao.status);
    expect(entregas.every((r) => r.status === 201 || r.status === 409)).toBe(true);
  });
});

describe('o fim do contrato contra a entrega', () => {
  it('excluir enquanto entregam: ou a exclusão perde, ou a entrega perde — nunca as duas passam', async () => {
    const licenca = await criarLicenca(api, { name: 'Corrida da exclusão', categoryId: cenario.categoriaLicencaId, seatsTotal: 5 });

    const [exclusao, entrega] = await Promise.all([
      api.delete(`/api/licenses/${licenca.id}`),
      api.post(`/api/licenses/${licenca.id}/checkout`, { assignedPersonId: pessoas[4] }),
    ]);

    expect([exclusao.status, entrega.status].sort()).toEqual(
      exclusao.status === 204 ? [204, 404] : [201, 409],
    );
    // A exclusão que perde recusa pela REGRA, com a licença travada — e não pela
    // FK, que daria o 409 genérico e passaria mesmo sem a trava.
    if (exclusao.status === 409) {
      expect((exclusao.body as { error: string }).error).toContain('já foi entregue e não pode ser excluída');
    }
  });

  it('encerrar enquanto entregam: nenhuma entrega passa depois do Encerrar', async () => {
    const licenca = await criarLicenca(api, { name: 'Corrida do encerrar', categoryId: cenario.categoriaLicencaId, seatsTotal: 5 });

    const [encerrar, entrega] = await Promise.all([
      api.post(`/api/licenses/${licenca.id}/terminate`),
      api.post(`/api/licenses/${licenca.id}/checkout`, { assignedPersonId: pessoas[5] }),
    ]);

    // O Encerrar passa com alguém usando, então ele nunca perde. A entrega que
    // chegou antes fica aberta; a que chegou depois encontra a licença encerrada.
    expect(encerrar.status).toBe(200);
    expect([201, 409]).toContain(entrega.status);
    const { body } = await api.get<{ status: string; emUso: number }>(`/api/licenses/${licenca.id}`);
    expect(body.status).toBe('ENCERRADA');
    expect(body.emUso).toBe(entrega.status === 201 ? 1 : 0);
  });
});

describe('a devolução dupla', () => {
  it('duas devoluções da mesma entrega: uma passa, a outra é 409', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Corrida da devolução', categoryId: cenario.categoriaLicencaId, seatsTotal: 2,
    });
    const entrega = await entregarLicenca(api, licenca.id, { assignedPersonId: pessoas[6] });

    const respostas = await Promise.all([
      api.post(`/api/licenses/checkouts/${entrega.id}/checkin`),
      api.post(`/api/licenses/checkouts/${entrega.id}/checkin`),
    ]);

    expect(placar(respostas)).toEqual({ 200: 1, 409: 1 });
    // A segunda esperou a trava da linha e encontrou a entrega fechada: a conta
    // não liberou duas.
    const { body } = await api.get<{ emUso: number; livres: number }>(`/api/licenses/${licenca.id}`);
    expect(body).toMatchObject({ emUso: 0, livres: 2 });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { assentosDa, cenarioDePosse, criarLicenca } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// A INVARIANTE 11 — `COUNT(assentos sem retiredAt) = seatsTotal`, SEMPRE.
//
// É a única invariante da F6 que o banco NÃO garante sozinho: ela atravessa
// duas tabelas, e um CHECK não enxerga a outra. Então ela mora no
// `reconcile-seats.usecase.ts` e é provada aqui.
//
// E é aqui que mora a correção do D92: a fórmula do plano prospectivo
// (`livres = seatsTotal − ocupados − queimados − aposentados`) dá o número
// ERRADO depois de um encolhimento, porque o aposentado já saiu de `seatsTotal`
// quando o contrato encolheu.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

/** O lado esquerdo da invariante 11, lido do banco. */
async function assentosVivos(licenseId: string): Promise<number> {
  return prisma.licenseSeat.count({ where: { licenseId, retiredAt: null } });
}

describe('o contrato e as linhas andam juntos', () => {
  it('criar uma licença de 5 cria 5 assentos, numerados de 1 a 5', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Contrato inicial', categoryId: cenario.categoriaLicencaId, seatsTotal: 5,
    });

    const assentos = await assentosDa(api, licenca.id);
    expect(assentos.map((a) => a.seatNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(await assentosVivos(licenca.id)).toBe(5);
    expect(licenca.livres).toBe(5);
  });

  it('subir de 5 para 8 cria três assentos e mantém a invariante', async () => {
    const licenca = await prisma.license.findFirstOrThrow({
      where: { name: 'Contrato inicial' }, select: { id: true },
    });

    const resposta = await api.put(`/api/licenses/${licenca.id}`, { seatsTotal: 8 });
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ seatsTotal: 8, livres: 8 });
    expect(await assentosVivos(licenca.id)).toBe(8);

    const assentos = await assentosDa(api, licenca.id);
    expect(assentos.map((a) => a.seatNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('descer para 6 APOSENTA os dois de maior número, sem apagar as linhas', async () => {
    const licenca = await prisma.license.findFirstOrThrow({
      where: { name: 'Contrato inicial' }, select: { id: true },
    });

    const resposta = await api.put(`/api/licenses/${licenca.id}`, { seatsTotal: 6 });
    expect(resposta.status).toBe(200);

    const assentos = await assentosDa(api, licenca.id);
    // AS OITO LINHAS CONTINUAM NA TABELA. Aposentar não é apagar: o histórico
    // de quem ocupou o assento 8 precisa continuar respondível.
    expect(assentos).toHaveLength(8);
    expect(assentos.filter((a) => a.retiredAt !== null).map((a) => a.seatNumber)).toEqual([7, 8]);

    // A invariante 11, a pergunta inteira deste arquivo.
    expect(await assentosVivos(licenca.id)).toBe(6);
  });

  it('A CONTA DO D92: livres NÃO subtrai os aposentados', async () => {
    const licenca = await prisma.license.findFirstOrThrow({
      where: { name: 'Contrato inicial' }, select: { id: true },
    });

    const { body } = await api.get<{
      seatsTotal: number; livres: number; ocupados: number;
      queimados: number; aposentados: number;
    }>(`/api/licenses/${licenca.id}`);

    // A fórmula do plano prospectivo daria `6 − 0 − 0 − 2 = 4`. A resposta
    // certa é 6: o aposentado JÁ saiu de `seatsTotal` quando o contrato
    // encolheu, e subtraí-lo de novo é contá-lo duas vezes.
    expect(body).toMatchObject({ seatsTotal: 6, livres: 6, ocupados: 0, queimados: 0, aposentados: 2 });
  });

  it('voltar a subir para 8 numera com MAX+1, sem colidir com os aposentados', async () => {
    const licenca = await prisma.license.findFirstOrThrow({
      where: { name: 'Contrato inicial' }, select: { id: true },
    });

    // `COUNT + 1` tentaria criar os números 7 e 8 de novo e esbarraria em
    // `license_seats_numero` — o P2002 viraria "Registro já existe", uma frase
    // que não ensina nada a quem só aumentou o contrato.
    const resposta = await api.put(`/api/licenses/${licenca.id}`, { seatsTotal: 8 });
    expect(resposta.status).toBe(200);

    const assentos = await assentosDa(api, licenca.id);
    expect(assentos).toHaveLength(10);
    expect(assentos.map((a) => a.seatNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(await assentosVivos(licenca.id)).toBe(8);
  });
});

describe('encolher abaixo do que está ocupado', () => {
  it('responde 409 com os números, e não aposenta nada', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Contrato apertado', categoryId: cenario.categoriaLicencaId, seatsTotal: 3,
    });

    for (const alvo of [{ assignedUserId: cenario.laura }, { assignedUserId: cenario.ana }]) {
      expect((await api.post(`/api/licenses/${licenca.id}/checkout-seat`, alvo)).status).toBe(201);
    }

    const resposta = await api.put<{ error: string }>(`/api/licenses/${licenca.id}`, { seatsTotal: 1 });
    expect(resposta.status).toBe(409);
    // A frase manda procurar no lugar certo. Um 409 genérico deixaria o
    // operador tentando de novo com o mesmo número.
    expect(resposta.body.error).toContain('Devolva assentos');

    // A TRANSAÇÃO VOLTOU ATRÁS INTEIRA: nem o `seatsTotal` mudou, nem nenhum
    // assento foi aposentado. Metade aplicada é o pior estado — seria um
    // contrato de 1 com 3 linhas vivas.
    const { body } = await api.get<{ seatsTotal: number }>(`/api/licenses/${licenca.id}`);
    expect(body.seatsTotal).toBe(3);
    expect(await assentosVivos(licenca.id)).toBe(3);
  });

  it('descer até o número do que está ocupado é aceito', async () => {
    const licenca = await prisma.license.findFirstOrThrow({
      where: { name: 'Contrato apertado' }, select: { id: true },
    });

    const resposta = await api.put(`/api/licenses/${licenca.id}`, { seatsTotal: 2 });
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ seatsTotal: 2, ocupados: 2, livres: 0, aposentados: 1 });
    expect(await assentosVivos(licenca.id)).toBe(2);
  });
});

describe('a queima interage com o contrato', () => {
  it('assento queimado não é livre, não é aposentado, e não volta', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Licença OEM', categoryId: cenario.categoriaLicencaId, seatsTotal: 5,
      reassignable: false,
    });

    const entrega = await api.post<{ seatId: string }>(
      `/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: cenario.laura },
    );
    expect(entrega.status).toBe(201);

    const devolucao = await api.post<{ queimado: boolean; livres: number }>(
      `/api/licenses/seats/${entrega.body.seatId}/checkin`, {},
    );
    expect(devolucao.status).toBe(200);
    // O retorno confirma o que a tela avisou ANTES de confirmar.
    expect(devolucao.body).toMatchObject({ queimado: true, livres: 4 });

    const { body } = await api.get<{
      seatsTotal: number; livres: number; queimados: number; aposentados: number;
    }>(`/api/licenses/${licenca.id}`);
    // 5 comprados, 4 utilizáveis. É a frase que o D43 usa para explicar por que
    // `burnedAt` é coluna própria: queima é PERDA DE DINHEIRO.
    expect(body).toMatchObject({ seatsTotal: 5, livres: 4, queimados: 1, aposentados: 0 });
    expect(await assentosVivos(licenca.id)).toBe(5);
  });

  it('o assento queimado nunca mais é escolhido pela entrega', async () => {
    const licenca = await prisma.license.findFirstOrThrow({
      where: { name: 'Licença OEM' }, select: { id: true },
    });
    const queimado = await prisma.licenseSeat.findFirstOrThrow({
      where: { licenseId: licenca.id, burnedAt: { not: null } }, select: { id: true },
    });

    // As quatro entregas restantes precisam cair nos QUATRO assentos vivos.
    for (const tentativa of [1, 2, 3, 4]) {
      const r = await api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedAssetId: cenario.ativo.id });
      expect(r.status, `entrega ${tentativa}`).toBe(201);
    }

    expect(await prisma.licenseSeatCheckout.count({
      where: { seatId: queimado.id, checkinAt: null },
    })).toBe(0);

    // E a quinta não tem onde cair: `livres` é zero porque um assento QUEIMOU.
    const quinta = await api.post<{ error: string }>(
      `/api/licenses/${licenca.id}/checkout-seat`, { assignedAssetId: cenario.ativo.id },
    );
    expect(quinta.status).toBe(409);
    expect(quinta.body.error).toContain('queimado');
  });

  it('encolher o contrato não escolhe assento queimado para aposentar', async () => {
    // Se escolhesse, `burnedAt` e `retiredAt` deixariam de ser disjuntos e a
    // conta do D92 passaria a contar o mesmo assento nas duas colunas.
    const licenca = await criarLicenca(api, {
      name: 'OEM que encolheu', categoryId: cenario.categoriaLicencaId, seatsTotal: 3,
      reassignable: false,
    });

    const entrega = await api.post<{ seatId: string }>(
      `/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: cenario.laura },
    );
    await api.post(`/api/licenses/seats/${entrega.body.seatId}/checkin`, {});

    expect((await api.put(`/api/licenses/${licenca.id}`, { seatsTotal: 2 })).status).toBe(200);

    const dosDois = await prisma.licenseSeat.count({
      where: { licenseId: licenca.id, burnedAt: { not: null }, retiredAt: { not: null } },
    });
    expect(dosDois).toBe(0);

    const { body } = await api.get<{ livres: number; queimados: number; aposentados: number }>(
      `/api/licenses/${licenca.id}`,
    );
    expect(body).toMatchObject({ livres: 1, queimados: 1, aposentados: 1 });
  });
});

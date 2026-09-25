import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarLicenca } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// AS CORRIDAS DO ASSENTO — o que "passa no teste com um usuário".
//
// CONTAR NÃO É TRAVAR, e aqui há uma volta a mais do que no estoque: lá o que
// se disputa é um NÚMERO (o saldo), e a trava é na linha-pai. Aqui o que se
// disputa é uma LINHA — o assento —, e é por isso que ele é materializado
// (D40): sem a linha, "pegue um livre" é uma conta sobre um contador e duas
// requisições simultâneas chegam ao mesmo resultado.
//
// A escolha e a trava acontecem na MESMA instrução (`FOR UPDATE … SKIP
// LOCKED`), e o `SKIP LOCKED` faz a segunda pegar o assento SEGUINTE em vez de
// esperar (D41). Por isso estes testes disparam as requisições sem `await`
// entre elas e contam os status. A asserção nunca é "deu certo": é "exatamente
// N passaram, e o banco tem exatamente N linhas".

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

/** Quantas respostas de cada status — é a única forma da asserção de corrida. */
function placar(respostas: { status: number }[]): Record<number, number> {
  const contagem: Record<number, number> = {};
  for (const r of respostas) contagem[r.status] = (contagem[r.status] ?? 0) + 1;
  return contagem;
}

async function ocupacoesAbertas(licenseId: string): Promise<number> {
  return prisma.licenseSeatCheckout.count({
    where: { seat: { licenseId }, checkinAt: null },
  });
}

describe('duas entregas simultâneas numa licença de UM assento', () => {
  it('deixa passar exatamente UMA', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Licença da corrida', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
    });

    const respostas = await Promise.all([
      api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: cenario.laura }),
      api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: cenario.ana }),
    ]);

    expect(placar(respostas)).toMatchObject({ 201: 1, 409: 1 });
    expect(await ocupacoesAbertas(licenca.id)).toBe(1);
  });

  it('não deixa a perdedora gravar uma ocupação já devolvida de consolação', async () => {
    // Uma linha com `checkinAt` preenchido criada pela requisição perdedora
    // seria histórico de uma entrega que nunca aconteceu, e o relatório de
    // "quem esteve com este assento" mentiria.
    const licenca = await prisma.license.findFirstOrThrow({
      where: { name: 'Licença da corrida' }, select: { id: true },
    });
    expect(await prisma.licenseSeatCheckout.count({ where: { seat: { licenseId: licenca.id } } })).toBe(1);
  });
});

describe('oito entregas simultâneas numa licença de CINCO assentos', () => {
  it('deixa passar exatamente CINCO, e em assentos DIFERENTES', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Licença do onboarding', categoryId: cenario.categoriaLicencaId, seatsTotal: 5,
    });

    const respostas = await Promise.all(
      Array.from({ length: 8 }, () =>
        api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedAssetId: cenario.ativo.id })),
    );

    expect(placar(respostas)).toMatchObject({ 201: 5, 409: 3 });
    expect(await ocupacoesAbertas(licenca.id)).toBe(5);

    // O QUE O `SKIP LOCKED` COMPRA: as cinco vencedoras pegaram assentos
    // DIFERENTES. Sem ele, ou elas esperariam em fila, ou — pior — duas
    // escolheriam o mesmo número e uma esbarraria no índice único, virando um
    // 409 que não deveria existir.
    const ocupados = await prisma.licenseSeatCheckout.findMany({
      where: { seat: { licenseId: licenca.id }, checkinAt: null },
      select: { seatId: true },
    });
    expect(new Set(ocupados.map((o) => o.seatId)).size).toBe(5);

    const depois = await api.get<{ seatsTotal: number; livres: number; ocupados: number }>(
      `/api/licenses/${licenca.id}`,
    );
    // NUNCA negativo, e nunca acima do contrato: é isso que a trava compra.
    expect(depois.body).toMatchObject({ seatsTotal: 5, livres: 0, ocupados: 5 });
  });

  it('nenhum assento ficou com duas ocupações abertas', async () => {
    // A rede do banco: `license_seat_uma_aberta_por_assento`. Esta consulta é a
    // mesma que o INVARIANTES.md manda rodar contra produção.
    const duplicados = await prisma.$queryRaw<{ seatId: string }[]>`
      SELECT "seatId" FROM license_seat_checkouts
       WHERE "checkinAt" IS NULL GROUP BY "seatId" HAVING COUNT(*) > 1
    `;
    expect(duplicados).toEqual([]);
  });
});

describe('devolver e entregar ao mesmo tempo', () => {
  it('não perde o assento que acabou de ser liberado', async () => {
    // A SEGUNDA CORRIDA, a que o D41 não cita: sem o checkin travar a linha do
    // ASSENTO, em READ COMMITTED o `FOR UPDATE OF s` da entrega não reavalia o
    // `WHERE` — o assento liberado um instante antes ficaria invisível e a
    // entrega responderia 409 com assento livre no banco.
    const licenca = await criarLicenca(api, {
      name: 'Licença do vaivém', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
    });

    const primeira = await api.post<{ seatId: string }>(
      `/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: cenario.laura },
    );
    expect(primeira.status).toBe(201);

    await api.post(`/api/licenses/seats/${primeira.body.seatId}/checkin`, {});

    const segunda = await api.post(
      `/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: cenario.ana },
    );
    expect(segunda.status).toBe(201);
    expect(await ocupacoesAbertas(licenca.id)).toBe(1);
  });
});

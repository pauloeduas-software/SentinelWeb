import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { hojeNoBrasil, somarDias } from '../../server/modules/shared/hoje.helper';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// OS CARTÕES DA TELA DE LICENÇAS — `GET /api/licenses/stats`.
//
// Cada licença cai em uma situação só, e o número do cartão é o total da lista que ele
// abre. Um número que não bate com a lista é pior que número nenhum.

interface Stats {
  total: number;
  ativas: number;
  vencendo: number;
  vencidas: number;
  encerradas: number;
}

let api: ApiDeTeste;

/** Uma licença pelo Prisma: o que se testa aqui é a contagem, não o cadastro. */
async function licenca(name: string, datas: { expirationDate?: Date; terminationDate?: Date }) {
  const categoria = await prisma.category.findFirstOrThrow({ where: { type: 'LICENSE' }, select: { id: true } });
  await prisma.license.create({ data: { id: randomUUID(), name, categoryId: categoria.id, seatsTotal: 1, ...datas } });
}

const contagem = async () => (await api.get<Stats>('/api/licenses/stats')).body;
const totalDe = async (status: string) =>
  (await api.get<{ total: number }>(`/api/licenses?status=${status}&perPage=1`)).body.total;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

describe('os cartões de Licenças', () => {
  it('cada licença conta em uma situação só, e o cartão bate com a lista que abre', async () => {
    const hoje = hojeNoBrasil();
    const antes = await contagem();

    await licenca(`Contagem ativa ${Date.now()}`, {});
    await licenca(`Contagem vencendo ${Date.now()}`, { expirationDate: somarDias(hoje, 5) });
    await licenca(`Contagem vencida ${Date.now()}`, { expirationDate: somarDias(hoje, -5) });
    await licenca(`Contagem encerrada ${Date.now()}`, { terminationDate: hoje });

    const depois = await contagem();
    expect(depois.total).toBe(antes.total + 4);
    expect(depois.ativas).toBe(antes.ativas + 1);
    expect(depois.vencendo).toBe(antes.vencendo + 1);
    expect(depois.vencidas).toBe(antes.vencidas + 1);
    expect(depois.encerradas).toBe(antes.encerradas + 1);

    expect(depois.ativas + depois.vencendo + depois.vencidas + depois.encerradas).toBe(depois.total);
    expect(await totalDe('ATIVA')).toBe(depois.ativas);
    expect(await totalDe('VENCENDO')).toBe(depois.vencendo);
    expect(await totalDe('EXPIRADA')).toBe(depois.vencidas);
    expect(await totalDe('ENCERRADA')).toBe(depois.encerradas);
  });
});

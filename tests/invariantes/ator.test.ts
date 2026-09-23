import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarColaborador, criarLocal } from '../helpers/fixtures';

// O ATOR CHEGA A TODA OPERAÇÃO — o fechamento do D23.
//
// A F3 deixou `recordActivity(client, input, actorId = null)` com um DEFAULT
// temporário porque `catalog` e `occupancy` estavam sendo trabalhados em
// paralelo e não podiam ser tocados. Enquanto o default existiu, essas cinco
// chamadas gravavam `actorId: null` — e o silêncio era o problema: uma linha de
// auditoria sem autor é indistinguível de uma operação feita antes do login.
//
// O default foi apagado (Leva 1 do docs/FECHAMENTO-F2-F4-PLANO-ITAM.md), e a
// primeira rede é o COMPILADOR: chamada sem ator não compila. Esta suíte é a
// segunda rede, e prova outra coisa — que o ator que chega ao log é o da
// SESSÃO, e não um `null` propagado com ar de valor legítimo.
//
// Por que `prisma` direto aqui: `activity_logs` não tem rota de leitura própria
// (o histórico do ativo e o da pessoa são consultas recortadas). Ler a tabela é
// o único jeito de ver a coluna que está sendo provada.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

/** O `actorId` da linha mais recente daquela entidade. */
async function atorDoUltimoLog(entityType: string, entityId: string, action: string) {
  const linha = await prisma.activityLog.findFirst({
    where: { entityType, entityId, action },
    orderBy: { createdAt: 'desc' },
    select: { actorId: true },
  });
  return linha?.actorId ?? null;
}

describe('catálogo', () => {
  it('grava o ator no CREATE, no UPDATE e no DELETE', async () => {
    const criado = await api.post<{ id: string }>('/api/manufacturers', { name: 'Fabricante com ator' });
    expect(criado.status).toBe(201);
    expect(await atorDoUltimoLog('Manufacturer', criado.body.id, 'CREATE')).toBe(api.adminId);

    const editado = await api.put(`/api/manufacturers/${criado.body.id}`, { name: 'Fabricante renomeado' });
    expect(editado.status).toBe(200);
    expect(await atorDoUltimoLog('Manufacturer', criado.body.id, 'UPDATE')).toBe(api.adminId);

    // O catálogo não tem lixeira (D8): o DELETE é real, e é justamente por isso
    // que o ator importa mais aqui do que num soft delete — a linha some da
    // tabela e o log vira a única memória de quem a apagou.
    const apagado = await api.delete(`/api/manufacturers/${criado.body.id}`);
    expect(apagado.status).toBe(200);
    expect(await atorDoUltimoLog('Manufacturer', criado.body.id, 'DELETE')).toBe(api.adminId);
  });
});

describe('ocupação de posto', () => {
  it('grava o ator ao colocar alguém no posto e ao encerrar a ocupação', async () => {
    const [mesa, pessoa] = await Promise.all([
      criarLocal(api, { name: 'Mesa do ator', isWorkstation: true }),
      criarColaborador(api, { name: 'Pessoa do ator', email: 'ator@teste.local' }),
    ]);

    const ocupou = await api.post<{ id: string }>(`/api/locations/${mesa}/occupants`, {
      userId: pessoa,
      shift: 'Manhã',
    });
    expect(ocupou.status).toBe(201);
    expect(await atorDoUltimoLog('LocationOccupant', ocupou.body.id, 'CREATE')).toBe(api.adminId);

    const encerrou = await api.delete(`/api/locations/${mesa}/occupants/${ocupou.body.id}`);
    expect(encerrou.status).toBe(200);

    // `END`, não `DELETE`: a linha continua na tabela com `endedAt`. É a
    // distinção que o `ActivityLog` guarda entre "a pessoa saiu do posto" e "o
    // vínculo foi cadastrado errado" — e as duas precisam de autor.
    expect(await atorDoUltimoLog('LocationOccupant', ocupou.body.id, 'END')).toBe(api.adminId);
  });

  it('é o ator da SESSÃO, e o D25 depende disso', async () => {
    // `LocationOccupant` NÃO ganha `openedById`/`closedById` (D25): a decisão
    // mandou a pergunta "quem cadastrou a Laura na Mesa 1?" para o
    // `ActivityLog`. Se o ator não chegasse aqui, a decisão teria mandado a
    // pergunta para um lugar que não a responde.
    const [mesa, pessoa] = await Promise.all([
      criarLocal(api, { name: 'Mesa do D25', isWorkstation: true }),
      criarColaborador(api, { name: 'Pessoa do D25', email: 'd25@teste.local' }),
    ]);

    const ocupou = await api.post<{ id: string }>(`/api/locations/${mesa}/occupants`, { userId: pessoa });

    const colunas = await prisma.locationOccupant.findUniqueOrThrow({
      where: { id: ocupou.body.id },
      select: { id: true },
    });
    expect(colunas).toBeTruthy();
    expect(await atorDoUltimoLog('LocationOccupant', ocupou.body.id, 'CREATE')).toBe(api.adminId);
  });
});

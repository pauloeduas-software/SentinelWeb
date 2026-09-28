import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { cenarioDePosse, criarAtivo } from '../helpers/fixtures';
import { agregarUsoDosAtivos } from '../../server/domain/reconciliation/use-cases/aggregate-usage.usecase';
import { prisma } from '../../server/core/database/prismaClient';

// ═════════════════════════════════════════════════════════════════════════════
// O USO AGREGADO NÃO PODE ENCOLHER — o D111.
//
// A agregação é um recálculo idempotente: rodar de hora em hora tem que
// reescrever o dia corrente com o total até agora e os dias fechados com o mesmo
// valor de sempre. A palavra que importa é MESMO.
//
// O corte da janela era `Date.now() - 3 dias`, que cai NO MEIO do dia mais
// antigo. O `GROUP BY … ::date` então recalculava aquele dia usando só a
// telemetria posterior ao corte, e o `ON CONFLICT DO UPDATE` sobrescrevia o
// total certo por um parcial. Rodando de hora em hora o dia encolhia a cada
// rodada até sair da janela e congelar truncado — um dia de trabalho inteiro
// virava a última hora dele, para sempre, e nenhum erro aparecia em lugar
// nenhum.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

/** Meia-noite UTC de `diasAtras` dias atrás. */
function diaUtc(diasAtras: number): Date {
  const hoje = new Date();
  return new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - diasAtras));
}

describe('o recálculo é idempotente de verdade', () => {
  it('o dia mais antigo da janela não perde os minutos já contados', async () => {
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'pc-uso',
    });

    const agente = await conectarAgente(api, 'uso-1');
    await agente.handshake({ Hostname: 'pc-uso' });
    const endpoint = await esperarPor('a máquina de uso', () => prisma.endpoint.findUnique({ where: { hwid: 'uso-1' } }));
    await agente.fechar();
    await api.post(`/api/endpoints/${endpoint.id}/link`, { assetId: ativo.id });

    // Um dia de trabalho espalhado: cinco baldes de 5 minutos distintos, do
    // começo da manhã até a noite. `activeMinutes` esperado = 5 × 5 = 25.
    const diaDeTrabalho = diaUtc(2);
    for (const hora of [0.5, 6.5, 12.5, 18.5, 23.5]) {
      await prisma.telemetry.create({
        data: {
          endpointId: endpoint.id,
          timestamp: new Date(diaDeTrabalho.getTime() + hora * 60 * 60 * 1000),
          cpuUsage: 10,
          ramTotal: 17179869184n,
          ramUsed: 8589934592n,
        },
      });
    }

    // Janela larga: o dia está inteiro dentro dela, e a conta nasce certa.
    await agregarUsoDosAtivos(10);
    const inteiro = await prisma.assetUsageDaily.findFirstOrThrow({
      where: { assetId: ativo.id, day: diaDeTrabalho },
    });
    expect(inteiro.activeMinutes).toBe(25);
    expect(inteiro.samples).toBe(5);

    // ⚠️ AGORA A JANELA DO JOB. Com o corte em "há N×24 horas", esta chamada
    // reescrevia o dia com a fração posterior ao corte — 20 minutos e 4
    // amostras, e cada rodada seguinte tirava mais um pedaço.
    await agregarUsoDosAtivos(3);
    const depois = await prisma.assetUsageDaily.findFirstOrThrow({
      where: { assetId: ativo.id, day: diaDeTrabalho },
    });
    expect(depois.activeMinutes).toBe(25);
    expect(depois.samples).toBe(5);

    // E de novo, porque "idempotente" quer dizer quantas vezes forem.
    await agregarUsoDosAtivos(3);
    await agregarUsoDosAtivos(3);
    const estavel = await prisma.assetUsageDaily.findFirstOrThrow({
      where: { assetId: ativo.id, day: diaDeTrabalho },
    });
    expect(estavel.activeMinutes).toBe(25);
  });

  it('o ativo com uso recente não aparece na lista de ociosos', async () => {
    const { body } = await api.get<{ rows: { hostname: string | null }[] }>('/api/reconciliation/idle?dias=30');
    expect(body.rows.map((row) => row.hostname)).not.toContain('pc-uso');
  });
});

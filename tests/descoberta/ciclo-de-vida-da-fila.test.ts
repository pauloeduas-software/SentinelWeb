import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { cenarioDePosse, criarAtivo, motivoDaBaixa } from '../helpers/fixtures';
import { rodarReconciliacao } from '../../server/modules/reconciliation/jobs/reconcile.job';
import { prisma } from '../../server/infra/database/prismaClient';

// ═════════════════════════════════════════════════════════════════════════════
// A FILA TEM TRÊS PORTAS DE SAÍDA, E A TERCEIRA É A QUE NÃO SE VÊ
// (docs/decisoes/reconciliacao.md, D110 e D112).
//
// Uma sugestão sai da fila quando alguém a aceita, quando alguém a recusa — e
// quando o MUNDO MUDA e ela deixa de descrever qualquer coisa. A terceira é a
// mais comum das três e era a que não existia.
//
// Este arquivo prova as duas que não dependem de quem aceita:
//
//   1. o cadastro mudar sozinho tira a sugestão da fila, como SUPERSEDED  (D110)
//   2. `discoveryMode = OFF` desliga a descoberta de verdade              (D112)
//
// `SUPERSEDED` e não `REJECTED` é o ponto do nº 1: ninguém disse não, o mundo
// andou. Recusa é ato de gente e tem memória (o `fila.test.ts` cobre essa); isto
// aqui não enterra uma afirmação que amanhã pode valer de novo.
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

async function novoAtivo(nome: string, serial?: string) {
  return criarAtivo(api, {
    statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: nome, serial,
  });
}

/** Uma máquina recém-descoberta, ainda sem vínculo: o estado em que a fila fala dela. */
async function maquinaDescoberta(hwid: string, hostname: string, serial?: string): Promise<string> {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: hostname, ...(serial ? { BiosSerial: serial } : {}) });
  const endpoint = await esperarPor(hwid, () => prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();
  return endpoint.id;
}

const pendentesDe = (endpointId: string) =>
  prisma.reconciliationSuggestion.count({
    where: { endpointId, kind: 'LINK', state: 'PENDING' },
  });

// ─────────────────────────────────────────────────────────────────────────────

describe('o mundo muda sozinho e a fila acompanha (D110)', () => {
  it('vincular a máquina à mão a OUTRO ativo encerra a sugestão como SUPERSEDED', async () => {
    // A sugestão nasce apontando para o ativo que tem o serial.
    const sugerido = await novoAtivo('pc-sugerido', 'SN-SUP-101');
    const escolhido = await novoAtivo('pc-escolhido');
    const endpointId = await maquinaDescoberta('sup-1', 'pc-sugerido', 'SN-SUP-101');

    await rodarReconciliacao();

    const nascida = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'LINK', state: 'PENDING' },
    });
    expect(nascida.assetId).toBe(sugerido.id);

    // E AGORA O MUNDO ANDA: quem opera sabe que a máquina é OUTRO ativo — o
    // serial foi digitado no cadastro errado — e faz o vínculo à mão. Uma
    // máquina é no máximo um ativo (invariante 12), então a proposta anterior
    // passou a falar de um mundo que não existe mais.
    const vinculo = await api.post(`/api/endpoints/${endpointId}/link`, { assetId: escolhido.id });
    expect(vinculo.status).toBe(201);

    // SEM RODAR O JOB: quem vincula já encerra o que dizia o contrário, na mesma
    // transação. Esperar a varredura deixaria por até uma hora um botão de
    // aceitar que o `@unique` do vínculo recusaria.
    expect(await pendentesDe(endpointId)).toBe(0);

    const encerrada = await prisma.reconciliationSuggestion.findUniqueOrThrow({
      where: { id: nascida.id },
    });
    // `SUPERSEDED`, não `REJECTED`: ninguém disse não a nada. E `resolvedAt`
    // preenchido é o que faz o expurgo do histórico da fila alcançá-la um dia.
    expect(encerrada.state).toBe('SUPERSEDED');
    expect(encerrada.resolvedAt).not.toBeNull();

    // A rodada seguinte não a ressuscita: a máquina tem ativo, e sugestão de
    // vínculo só nasce para quem não tem.
    await rodarReconciliacao();
    expect(await pendentesDe(endpointId)).toBe(0);
  });

  it('a baixa e a lixeira encerram a sugestão do computador na hora (CL)', async () => {
    const vendido = await novoAtivo('pc-vendido', 'SN-SUP-201');
    const apagado = await novoAtivo('pc-apagado', 'SN-SUP-202');
    const maquinaDoVendido = await maquinaDescoberta('sup-2', 'pc-vendido', 'SN-SUP-201');
    const maquinaDoApagado = await maquinaDescoberta('sup-3', 'pc-apagado', 'SN-SUP-202');
    await rodarReconciliacao();
    expect(await pendentesDe(maquinaDoVendido)).toBe(1);
    expect(await pendentesDe(maquinaDoApagado)).toBe(1);

    expect((await api.post(`/api/assets/${vendido.id}/retire`, { retiredReasonId: await motivoDaBaixa() })).status).toBe(200);
    expect((await api.delete(`/api/assets/${apagado.id}`)).status).toBe(200);

    // SEM RODAR O JOB, como no vínculo: o Aceitar que sobrasse seria 409 (o
    // baixado não recebe máquina) ou 404 (o da lixeira não é encontrado).
    const encerradas = await prisma.reconciliationSuggestion.findMany({
      where: { assetId: { in: [vendido.id, apagado.id] } },
      select: { state: true, resolvedAt: true },
    });
    expect(encerradas).toHaveLength(2);
    for (const sugestao of encerradas) {
      expect(sugestao.state).toBe('SUPERSEDED');
      expect(sugestao.resolvedAt).not.toBeNull();
    }

    // E a rodada seguinte não as ressuscita: o baixado sai antes de virar
    // sugestão, e o da lixeira nem entra na cascata.
    await rodarReconciliacao();
    expect(await pendentesDe(maquinaDoVendido)).toBe(0);
    expect(await pendentesDe(maquinaDoApagado)).toBe(0);
  });

  it('a sugestão que a rodada propôs enquanto a baixa gravava sai na rodada seguinte (CL)', async () => {
    const vendido = await novoAtivo('pc-da-corrida', 'SN-SUP-301');
    const apagado = await novoAtivo('pc-da-outra-corrida', 'SN-SUP-302');
    const maquinaDoVendido = await maquinaDescoberta('sup-4', 'pc-da-corrida', 'SN-SUP-301');
    const maquinaDoApagado = await maquinaDescoberta('sup-5', 'pc-da-outra-corrida', 'SN-SUP-302');
    await rodarReconciliacao();

    // A CORRIDA, à mão: a baixa e a lixeira gravadas sem a transação que encerra a
    // fila. É o que fica quando a rodada lê o computador antes da baixa e
    // propõe depois dela.
    await prisma.asset.update({
      where: { id: vendido.id },
      data: { retiredAt: new Date(), retiredReasonId: await motivoDaBaixa() },
    });
    await prisma.asset.update({ where: { id: apagado.id }, data: { deletedAt: new Date() } });
    expect(await pendentesDe(maquinaDoVendido)).toBe(1);
    expect(await pendentesDe(maquinaDoApagado)).toBe(1);

    await rodarReconciliacao();
    expect(await pendentesDe(maquinaDoVendido)).toBe(0);
    expect(await pendentesDe(maquinaDoApagado)).toBe(0);
  });
});

describe('discoveryMode = OFF desliga a descoberta (D112)', () => {
  it('não nasce sugestão de vínculo, e volta a nascer em SUGGEST', async () => {
    const ativo = await novoAtivo('pc-desligado', 'SN-OFF-777');

    await api.put('/api/settings/discovery', { discoveryMode: 'OFF' });

    const endpointId = await maquinaDescoberta('off-1', 'pc-desligado', 'SN-OFF-777');

    await rodarReconciliacao();

    // O enum tinha três valores e só `ON` era lido: `OFF` se comportava como
    // `SUGGEST`, então quem desligava a descoberta continuava recebendo tudo.
    // Configuração que não faz nada é pior que configuração que falta.
    expect(await pendentesDe(endpointId)).toBe(0);

    await api.put('/api/settings/discovery', { discoveryMode: 'SUGGEST' });
    await rodarReconciliacao();

    const sugestao = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'LINK', state: 'PENDING' },
    });
    expect(sugestao.assetId).toBe(ativo.id);
    expect(sugestao.signal).toBe('SERIAL');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { rodarReconciliacao } from '../../server/domain/reconciliation/jobs/reconcile.job';
import { prisma } from '../../server/core/database/prismaClient';

// A CASCATA, E OS TRÊS CASOS DE LIXO — o D46.
//
// "Evidência que casa com mais de um candidato não é evidência: pontua ZERO."
// Este arquivo é a prova disso, e ele importa mais que os outros: o estrago de
// um vínculo errado não é uma linha errada, é uma linha errada que NINGUÉM
// REVISA — porque o sistema disse que estava certa.

let api: ApiDeTeste;
let modelId: string;
let statusId: string;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  modelId = await criarModelo(api, {
    categoriaId: seed.categoriaId,
    fabricanteId: await criarFabricante(api),
  });
});

afterAll(async () => {
  await api.fechar();
});

/** O ativo com serial digitado — o lado CADASTRADO do vínculo. */
async function ativoComSerial(serial: string, nome: string) {
  return criarAtivo(api, { statusId, modelId, name: nome, serial });
}

async function sugestoesDe(hwid: string) {
  const endpoint = await prisma.endpoint.findUniqueOrThrow({ where: { hwid }, select: { id: true } });
  const { body } = await api.get<{ rows: { kind: string; signal: string | null; score: number }[] }>(
    `/api/reconciliation/suggestions?endpointId=${endpoint.id}`,
  );
  return body.rows;
}

describe('serial de fábrica em branco não casa com nada', () => {
  it('duas máquinas com "To Be Filled By O.E.M." não viram vínculo', async () => {
    await ativoComSerial('To Be Filled By O.E.M.', 'Ativo com serial de fábrica');

    for (const hwid of ['lixo-1', 'lixo-2']) {
      const agente = await conectarAgente(api, hwid);
      await agente.handshake({ BiosSerial: 'To Be Filled By O.E.M.', Hostname: hwid });
      await esperarPor(`${hwid} aparecer`, () => prisma.endpoint.findUnique({ where: { hwid } }));
      await agente.fechar();
    }

    await rodarReconciliacao();

    // NENHUMA sugestão por SERIAL. O texto está na lista de lixo conhecido do
    // `normalize-identity.helper`, então ele vira `null` ANTES da comparação —
    // e um `null` não casa nem com o ativo que tem literalmente o mesmo texto.
    expect((await sugestoesDe('lixo-1')).filter((row) => row.signal === 'SERIAL')).toHaveLength(0);
    expect((await sugestoesDe('lixo-2')).filter((row) => row.signal === 'SERIAL')).toHaveLength(0);
  });
});

describe('serial legítimo repetido em duas máquinas também vale zero', () => {
  it('o parque desmente o serial, mesmo fora da lista de lixo', async () => {
    await ativoComSerial('SN-CLONE-77', 'Ativo clonado');

    for (const hwid of ['clone-a', 'clone-b']) {
      const agente = await conectarAgente(api, hwid);
      await agente.handshake({ BiosSerial: 'SN-CLONE-77', Hostname: hwid });
      await esperarPor(`${hwid} aparecer`, () => prisma.endpoint.findUnique({ where: { hwid } }));
      await agente.fechar();
    }

    await rodarReconciliacao();

    // A lista estática nunca vai conter todo texto que uma fábrica inventa —
    // quem descobre o resto é o próprio parque. Um serial que aparece em duas
    // MÁQUINAS não identifica nenhuma delas, esteja escrito o que estiver.
    const sugestoes = await sugestoesDe('clone-a');
    expect(sugestoes.filter((row) => row.kind === 'LINK' && row.signal === 'SERIAL')).toHaveLength(0);
  });
});

describe('serial único casa, e casa com 100', () => {
  it('sugere o vínculo sem criá-lo — o modo padrão é SUGGEST', async () => {
    const ativo = await ativoComSerial('SN-UNICO-42', 'Notebook da Ana');

    const agente = await conectarAgente(api, 'unico-1');
    await agente.handshake({ BiosSerial: 'SN-UNICO-42', Hostname: 'pc-ana' });
    await esperarPor('a máquina única', () => prisma.endpoint.findUnique({ where: { hwid: 'unico-1' } }));
    await agente.fechar();

    await rodarReconciliacao();

    const sugestoes = await sugestoesDe('unico-1');
    const vinculo = sugestoes.find((row) => row.kind === 'LINK');
    expect(vinculo).toMatchObject({ signal: 'SERIAL', score: 100 });

    // E O VÍNCULO NÃO ACONTECEU SOZINHO: `discoveryMode` nasce em `SUGGEST`
    // (D51), então nem os 100 pontos vinculam. Em `ON`, a primeira VM de teste
    // viraria patrimônio e consumiria uma etiqueta que o contador nunca devolve.
    const endpoint = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'unico-1' } });
    expect(endpoint.assetId).toBeNull();

    // Aceitar é o que vincula.
    const pendente = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId: endpoint.id, kind: 'LINK', state: 'PENDING' },
    });
    const aceite = await api.post(`/api/reconciliation/suggestions/${pendente.id}/accept`);
    expect(aceite.status).toBe(200);

    const vinculado = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'unico-1' } });
    expect(vinculado.assetId).toBe(ativo.id);

    // E deixou rastro no histórico DO ATIVO, que é onde alguém vai procurar.
    const log = await prisma.activityLog.findFirst({
      where: { entityType: 'Asset', entityId: ativo.id, action: 'LINK' },
    });
    expect(log?.actorId).toBe(api.adminId);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O HOSTNAME OLHA DUAS COLUNAS DO ATIVO, E ISSO É UMA AMBIGUIDADE SÓ.
//
// O sinal `HOSTNAME` compara o nome da máquina com o `name` E com o `assetTag`
// do ativo. Eram duas chamadas com dois índices separados, e a regra da colisão
// é POR ÍNDICE — então um hostname que casava com o `name` de um ativo e com o
// `assetTag` de outro produzia DUAS sugestões de 60 pontos em vez de uma colisão
// de zero. O D46 vazando pela fresta entre as duas chamadas.
//
// A pergunta que o sinal responde é uma só — *que ativo se chama assim?* — então
// o índice também é um só.
// ═════════════════════════════════════════════════════════════════════════════

describe('hostname que alcança dois ativos por colunas diferentes', () => {
  it('é colisão, e não duas sugestões de 60 pontos', async () => {
    await criarAtivo(api, { statusId, modelId, name: 'pc-ambiguo' });
    await criarAtivo(api, { statusId, modelId, assetTag: 'pc-ambiguo', name: 'Outro equipamento' });

    const agente = await conectarAgente(api, 'ambiguo-1');
    await agente.handshake({ Hostname: 'pc-ambiguo' });
    await esperarPor('a máquina ambígua', () => prisma.endpoint.findUnique({ where: { hwid: 'ambiguo-1' } }));
    await agente.fechar();

    await rodarReconciliacao();

    // ZERO. Pegar o primeiro numa colisão é pior do que não vincular: cria um
    // vínculo errado que ninguém revisa, porque o sistema disse que estava certo.
    const porHostname = (await sugestoesDe('ambiguo-1')).filter((linha) => linha.signal === 'HOSTNAME');
    expect(porHostname).toHaveLength(0);
  });

  it('mas o ativo cujo assetTag é o hostname continua casando quando é o único', async () => {
    await criarAtivo(api, { statusId, modelId, assetTag: 'pc-por-etiqueta', name: 'Equipamento sem nome útil' });

    const agente = await conectarAgente(api, 'etiqueta-1');
    await agente.handshake({ Hostname: 'pc-por-etiqueta' });
    await esperarPor('a máquina da etiqueta', () => prisma.endpoint.findUnique({ where: { hwid: 'etiqueta-1' } }));
    await agente.fechar();

    await rodarReconciliacao();

    // O índice único não pode ter fechado a porta do sinal — só a da ambiguidade.
    const porHostname = (await sugestoesDe('etiqueta-1')).filter((linha) => linha.signal === 'HOSTNAME');
    expect(porHostname).toHaveLength(1);
    expect(porHostname[0].score).toBe(60);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { rodarReconciliacao } from '../../server/domain/reconciliation/jobs/reconcile.job';
import { prisma } from '../../server/core/database/prismaClient';

// A FUSÃO — reimagem ou troca de placa muda o `hwid`, e o agente reinstalado
// cria uma linha nova sem saber que já existia.
//
// **Regra em uma linha:** quando o serial casa com um ativo que JÁ TEM endpoint
// vinculado, isso não é vínculo, é MERGE. É a operação mais destrutiva da fase e
// a única sem desfazer — por isso é humana, transacional e registrada.

let api: ApiDeTeste;
let modelId: string;
let statusId: string;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId: await criarFabricante(api) });
});

afterAll(async () => {
  await api.fechar();
});

describe('o serial casa com um ativo que já tem máquina', () => {
  it('sugere FUSÃO, e não um segundo vínculo', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'notebook-reimagem', serial: 'SN-MERGE-1' });

    // A máquina original, já vinculada.
    const antiga = await conectarAgente(api, 'merge-antiga');
    await antiga.handshake({ Hostname: 'pc-velho', BiosSerial: 'SN-MERGE-1' });
    const velha = await esperarPor('a máquina antiga', () => prisma.endpoint.findUnique({ where: { hwid: 'merge-antiga' } }));
    await antiga.telemetria();
    await esperarPor('telemetria da antiga', async () => {
      const total = await prisma.telemetry.count({ where: { endpointId: velha.id } });
      return total > 0 ? total : null;
    });
    await antiga.fechar();
    await api.post(`/api/endpoints/${velha.id}/link`, { assetId: ativo.id });

    // A MESMA máquina volta depois da reimagem: `hwid` novo, serial igual.
    const nova = await conectarAgente(api, 'merge-nova');
    await nova.handshake({ Hostname: 'pc-novo', BiosSerial: 'SN-MERGE-1' });
    await esperarPor('a máquina nova', () => prisma.endpoint.findUnique({ where: { hwid: 'merge-nova' } }));
    await nova.fechar();

    await rodarReconciliacao();

    const recem = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'merge-nova' } });
    const sugestoes = await prisma.reconciliationSuggestion.findMany({
      where: { endpointId: recem.id, state: 'PENDING' },
    });

    // MERGE, e NENHUM vínculo: propor o vínculo aqui criaria uma disputa de duas
    // linhas pelo mesmo ativo, que o `@unique` recusaria com um erro sem
    // explicação na cara de quem clicou em aceitar.
    expect(sugestoes.map((sugestao) => sugestao.kind)).toEqual(['MERGE']);
    expect(sugestoes[0].mergeIntoEndpointId).toBe(velha.id);
  });

  it('aceitar move a telemetria, preserva o vínculo e deixa a linha antiga', async () => {
    const recem = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'merge-nova' } });
    const velha = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'merge-antiga' } });
    const sugestao = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId: recem.id, kind: 'MERGE', state: 'PENDING' },
    });

    const antesNaVelha = await prisma.telemetry.count({ where: { endpointId: velha.id } });
    expect(antesNaVelha).toBeGreaterThan(0);

    const aceite = await api.post(`/api/reconciliation/suggestions/${sugestao.id}/accept`);
    expect(aceite.status).toBe(200);

    // A linha NOVA é a que some da listagem: ela é a `:id` da fusão, e o que se
    // preserva é a linha com histórico e vínculo.
    const fundida = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'merge-nova' } });
    expect(fundida.mergedIntoId).toBe(velha.id);
    expect(fundida.assetId).toBeNull();

    // ⚠️ A LINHA NÃO FOI APAGADA (D103): o agente antigo pode voltar, e o
    // `ApiToken` daquela instalação aponta para este id.
    expect(fundida.id).toBe(recem.id);

    // E ela sai da listagem do painel, senão a mesma máquina apareceria duas vezes.
    const { body } = await api.get<{ rows: { hwid: string }[] }>('/api/endpoints?perPage=500');
    expect(body.rows.map((row) => row.hwid)).not.toContain('merge-nova');

    // O histórico do ATIVO registra a fusão — é lá que alguém vai procurar por
    // que a telemetria mudou de máquina.
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: 'Asset', entityId: velha.assetId!, action: 'MERGE' },
    });
    expect(log.actorId).toBe(api.adminId);
  });
});

describe('o que a fusão recusa', () => {
  it('não funde máquinas de ativos diferentes', async () => {
    const ativoX = await criarAtivo(api, { statusId, modelId, name: 'ativo-x' });
    const ativoY = await criarAtivo(api, { statusId, modelId, name: 'ativo-y' });

    const ids: string[] = [];
    for (const [hwid, assetId] of [['dif-x', ativoX.id], ['dif-y', ativoY.id]] as const) {
      const agente = await conectarAgente(api, hwid);
      await agente.handshake({ Hostname: hwid });
      const endpoint = await esperarPor(hwid, () => prisma.endpoint.findUnique({ where: { hwid } }));
      await agente.fechar();
      await api.post(`/api/endpoints/${endpoint.id}/link`, { assetId });
      ids.push(endpoint.id);
    }

    const { status } = await api.post(`/api/endpoints/${ids[0]}/merge`, { intoEndpointId: ids[1] });
    // Fundir seria dizer que dois PATRIMÔNIOS são a mesma coisa — problema de
    // cadastro de ativo, que se resolve na tela de ativos com a nota fiscal na
    // mão, não pelo RMM.
    expect(status).toBe(409);
  });

  it('não funde uma máquina nela mesma', async () => {
    const endpoint = await prisma.endpoint.findFirstOrThrow({ where: { hwid: 'dif-x' } });
    const { status } = await api.post(`/api/endpoints/${endpoint.id}/merge`, { intoEndpointId: endpoint.id });
    expect(status).toBe(422);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A CONSOLIDAÇÃO — o caminho NORMAL da fusão, e o que não tinha teste.
//
// O D108 diz que `endpoint_user_daily` é única por (máquina, conta, dia) e
// `software_installations` por (máquina, pacote), e que as duas linhas podem ter
// registros do MESMO dia e do MESMO pacote — é o caso comum, porque a reimagem
// acontece no meio de um dia de trabalho. Mover cegamente violaria o índice e
// derrubaria a fusão inteira na metade.
//
// Ou seja: o ramo que a fusão percorre quase sempre era justamente o que a suíte
// não exercitava, numa operação sem desfazer.
// ═════════════════════════════════════════════════════════════════════════════

describe('a consolidação do que colide', () => {
  it('soma amostras, estica as datas e preserva o "instalado desde" mais antigo', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'pc-consolida' });

    const ids: Record<string, string> = {};
    for (const hwid of ['cons-velha', 'cons-nova']) {
      const agente = await conectarAgente(api, hwid);
      await agente.handshake({ Hostname: hwid });
      const endpoint = await esperarPor(hwid, () => prisma.endpoint.findUnique({ where: { hwid } }));
      await agente.fechar();
      ids[hwid] = endpoint.id;
    }
    const velha = ids['cons-velha'];
    const nova = ids['cons-nova'];
    await api.post(`/api/endpoints/${velha}/link`, { assetId: ativo.id });

    // O MESMO DIA nas duas linhas, que é o que a reimagem no meio do expediente
    // produz. Escrita direta por Prisma: a "API" destas linhas é o agente
    // mandando handshake em horas diferentes do mesmo dia.
    const hoje = new Date();
    const dia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - 1));
    const manha = new Date(dia.getTime() + 11 * 60 * 60 * 1000);
    const tarde = new Date(dia.getTime() + 20 * 60 * 60 * 1000);

    await prisma.endpointUserDaily.create({
      data: { endpointId: velha, userKey: 'laura', day: dia, firstSeenAt: manha, lastSeenAt: manha, samples: 4 },
    });
    await prisma.endpointUserDaily.create({
      data: { endpointId: nova, userKey: 'laura', day: dia, firstSeenAt: tarde, lastSeenAt: tarde, samples: 7 },
    });

    // E o MESMO PACOTE, instalado antes da reimagem e ainda presente depois.
    const pacote = await prisma.softwarePackage.create({
      data: { name: 'Office', version: '16.0', publisher: 'Microsoft', normalizedKey: 'office|16.0|microsoft' },
    });
    const antigo = new Date(dia.getTime() - 60 * 24 * 60 * 60 * 1000);
    await prisma.softwareInstallation.create({
      data: { endpointId: velha, packageId: pacote.id, firstSeenAt: antigo, lastSeenAt: manha },
    });
    await prisma.softwareInstallation.create({
      data: { endpointId: nova, packageId: pacote.id, firstSeenAt: tarde, lastSeenAt: tarde },
    });

    // O lastSeen do perdedor é o mais RECENTE: o vencedor tem que ficar com ele.
    await prisma.endpoint.update({ where: { id: nova }, data: { lastSeen: tarde } });
    await prisma.endpoint.update({ where: { id: velha }, data: { lastSeen: manha } });

    const fusao = await api.post(`/api/endpoints/${nova}/merge`, { intoEndpointId: velha });
    expect(fusao.status).toBe(200);

    // UMA linha por (máquina, conta, dia), com as amostras SOMADAS e a janela de
    // horas ESTICADA para cobrir o dia inteiro das duas.
    const dias = await prisma.endpointUserDaily.findMany({ where: { endpointId: velha, userKey: 'laura' } });
    expect(dias).toHaveLength(1);
    expect(dias[0].samples).toBe(11);
    expect(dias[0].firstSeenAt.toISOString()).toBe(manha.toISOString());
    expect(dias[0].lastSeenAt.toISOString()).toBe(tarde.toISOString());
    expect(await prisma.endpointUserDaily.count({ where: { endpointId: nova } })).toBe(0);

    // "Instalado desde" é fato da MÁQUINA, não da linha: se o Office estava lá
    // antes da reimagem, a data antiga é a que responde a pergunta da auditoria.
    const instalacoes = await prisma.softwareInstallation.findMany({ where: { endpointId: velha } });
    expect(instalacoes).toHaveLength(1);
    expect(instalacoes[0].firstSeenAt.toISOString()).toBe(antigo.toISOString());

    // D108: o vencedor fica com o `lastSeen` MAIS RECENTE dos dois — a máquina
    // esteve viva naquela data, independentemente de qual linha registrou.
    const vencedor = await prisma.endpoint.findUniqueOrThrow({ where: { id: velha } });
    expect(vencedor.lastSeen.toISOString()).toBe(tarde.toISOString());

    // E o token daquela instalação segue o binário, que é o mesmo: revogá-lo por
    // causa de uma reimagem derrubaria o agente que está funcionando agora.
    expect(await prisma.apiToken.count({ where: { endpointId: nova } })).toBe(0);
  });
});

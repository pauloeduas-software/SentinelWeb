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
  // A fila não filtra por máquina: o recorte é daqui, sobre as pendentes.
  const { body } = await api.get<{
    rows: { kind: string; signal: string | null; score: number; endpoint: { id: string } }[];
  }>('/api/reconciliation/suggestions');
  return body.rows.filter((linha) => linha.endpoint.id === endpoint.id);
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
    expect(log).not.toBeNull();
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

// ═════════════════════════════════════════════════════════════════════════════
// ATIVO QUE JÁ TEM MÁQUINA — e por que ele entra na cascata antes de sair dela.
//
// A fusão de máquinas saiu: o `hwid` é derivado do hardware e estável entre
// reinstalações, então não existe segunda linha para a mesma máquina. O que
// existia era o ramo que absorvia o caso "o serial casa com um ativo que JÁ TEM
// máquina" — e, sem ele, a mesma evidência produziria uma sugestão de VÍNCULO
// que o `endpoints.assetId @unique` recusa no aceite.
//
// A GUARDA TEM DUAS METADES, e a segunda é a que já foi escrita errada uma vez:
// filtrar o ativo ocupado NA CONSULTA desligaria o D46, porque a colisão é
// contada sobre a lista de candidatos. Tirar um dos ambíguos de vista
// transformaria "não sei qual dos dois" em "é este".
// ═════════════════════════════════════════════════════════════════════════════

describe('ativo que já tem máquina', () => {
  it('não recebe sugestão de vínculo de uma segunda máquina', async () => {
    const ativo = await ativoComSerial('SN-OCUPADO-1', 'Ativo já vinculado');

    // A primeira máquina leva o ativo, pelo caminho humano.
    const primeira = await conectarAgente(api, 'ocupa-primeira');
    await primeira.handshake({ Hostname: 'pc-primeira', BiosSerial: 'SN-OCUPADO-1' });
    const dela = await esperarPor('a primeira máquina', () => prisma.endpoint.findUnique({ where: { hwid: 'ocupa-primeira' } }));
    await primeira.fechar();
    await api.post(`/api/endpoints/${dela.id}/link`, { assetId: ativo.id });

    // A segunda chega com o MESMO serial. Antes isto era sugestão de fusão.
    const segunda = await conectarAgente(api, 'ocupa-segunda');
    await segunda.handshake({ Hostname: 'pc-segunda', BiosSerial: 'SN-OCUPADO-1' });
    await esperarPor('a segunda máquina', () => prisma.endpoint.findUnique({ where: { hwid: 'ocupa-segunda' } }));
    await segunda.fechar();

    await rodarReconciliacao();

    // NADA. Propor o vínculo aqui seria oferecer um botão que o `@unique`
    // recusa — a máquina fica como órfã na triagem, que é a conversa certa.
    expect(await sugestoesDe('ocupa-segunda')).toHaveLength(0);
  });

  it('mas continua contando para a colisão: hostname ambíguo não vira resposta', async () => {
    // EXATAMENTE DOIS ativos com o mesmo NOME, e um nome que nenhum outro caso
    // deste arquivo usa — o banco é um por ARQUIVO, e um terceiro ativo
    // ambíguo faria este teste passar pelo motivo errado.
    //
    // `Asset.name` não está em índice único nenhum, ao contrário de `serial` e
    // `assetTag`: dois ativos vivos com o mesmo nome são cadastro do dia a dia.
    const ocupado = await criarAtivo(api, { statusId, modelId, name: 'pc-nome-repetido' });
    await criarAtivo(api, { statusId, modelId, name: 'pc-nome-repetido' });

    const dona = await conectarAgente(api, 'repetido-dono');
    await dona.handshake({ Hostname: 'maquina-do-ocupado' });
    const dela = await esperarPor('a máquina do ocupado', () => prisma.endpoint.findUnique({ where: { hwid: 'repetido-dono' } }));
    await dona.fechar();
    await api.post(`/api/endpoints/${dela.id}/link`, { assetId: ocupado.id });

    const nova = await conectarAgente(api, 'repetido-novo');
    await nova.handshake({ Hostname: 'pc-nome-repetido' });
    await esperarPor('a máquina nova', () => prisma.endpoint.findUnique({ where: { hwid: 'repetido-novo' } }));
    await nova.fechar();

    await rodarReconciliacao();

    // ZERO, e o motivo importa: o hostname casou com DOIS ativos, então não
    // identifica nenhum (D46). Se a guarda do caso acima fosse escrita como
    // filtro na CONSULTA, o ativo ocupado sairia de vista, o livre ficaria
    // sozinho, e esta máquina receberia uma sugestão de 60 pontos com cara de
    // certeza — para um cadastro que tem dois ativos com o mesmo nome.
    const porHostname = (await sugestoesDe('repetido-novo')).filter((linha) => linha.signal === 'HOSTNAME');
    expect(porHostname).toHaveLength(0);
  });

  it('e o vínculo manual recusa com uma instrução que existe', async () => {
    const ativo = await ativoComSerial('SN-OCUPADO-2', 'Ativo de vínculo duplo');

    const primeira = await conectarAgente(api, 'duplo-primeira');
    await primeira.handshake({ Hostname: 'pc-duplo-1' });
    const dela = await esperarPor('a primeira do duplo', () => prisma.endpoint.findUnique({ where: { hwid: 'duplo-primeira' } }));
    await primeira.fechar();
    await api.post(`/api/endpoints/${dela.id}/link`, { assetId: ativo.id });

    const segunda = await conectarAgente(api, 'duplo-segunda');
    await segunda.handshake({ Hostname: 'pc-duplo-2' });
    const outra = await esperarPor('a segunda do duplo', () => prisma.endpoint.findUnique({ where: { hwid: 'duplo-segunda' } }));
    await segunda.fechar();

    const { status, body } = await api.post<{ error: string }>(
      `/api/endpoints/${outra.id}/link`,
      { assetId: ativo.id },
    );

    // 409 do `endpoints.assetId @unique`, traduzido. A mensagem mandava "usar a
    // fusão" — uma rota que não existe mais. O caminho que ela cita agora é o
    // botão Desvincular da aba Máquina, e é o que o operador pode fazer.
    expect(status).toBe(409);
    expect(body.error).toMatch(/já está vinculado a outra máquina/i);
    expect(body.error).not.toMatch(/fus[ãa]o/i);
  });
});


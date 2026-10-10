import type { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { registerAgent } from '../../server/domain/agent/agent.registry';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor, type AgenteDeTeste } from '../helpers/agente';

// UMA MÁQUINA PELO ID, E O COMANDO NELA — as duas rotas que a telemetria ganhou
// ao sair da tela de frota para a ficha do ativo e a do posto.
//
// Fica em `descoberta/` porque é o lado do AGENTE: as duas rotas só respondem
// algo porque houve handshake, e a do comando precisa do WebSocket aberto. Os
// filtros da LISTAGEM de máquinas são outro assunto e estão em
// `listagens/maquinas.test.ts`.
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE O 200 DO COMANDO PROVA.
//
// A resolução: o registro de agentes é um mapa indexado pelo HWID
// (`agent.registry.ts`) e a rota recebe o ID. Se ela resolvesse o hwid errado —
// ou não resolvesse —, não haveria socket sob aquela chave e a resposta seria
// 409.
//
// E A ENTREGA. O `AgenteDeTeste` guarda o que o servidor lhe manda, e o caso do
// agente conectado lê o pacote do outro lado do socket: o `CommandId` que a
// rota devolveu é o que chegou. Era o que faltava: `sendToAgent` devolvia `true`
// assim que achava o socket no mapa, sem olhar o estado dele e sem esperar o
// `send` — e existia um "200 Comando enviado" para um comando que não saiu do
// processo. Os dois casos do fim provam o outro lado: socket no mapa que já
// está fechando é 409, e escrita que falha é 502. Nenhum dos dois é 200.
// ─────────────────────────────────────────────────────────────────────────────

const HWID = 'maquina-do-comando';
const UUID_QUE_NAO_EXISTE = '00000000-0000-0000-0000-000000000000';

let api: ApiDeTeste;
let agente: AgenteDeTeste;
let endpointId: string;

beforeAll(async () => {
  api = await criarApi();

  agente = await conectarAgente(api, HWID);
  await agente.handshake({ Hostname: 'pc-do-comando', OsVersion: 'Windows 11 Pro' });

  const maquina = await esperarPor('a máquina do handshake', () =>
    prisma.endpoint.findUnique({ where: { hwid: HWID } }));
  endpointId = maquina.id;
});

afterAll(async () => {
  await api.fechar();
});

describe('GET /api/endpoints/:id', () => {
  it('devolve a máquina com a amostra de telemetria mais recente', async () => {
    await agente.telemetria({ CpuUsagePercentage: 42.5 });
    await esperarPor('a primeira amostra', () =>
      prisma.telemetry.findFirst({ where: { endpointId } }));

    // Uma SEGUNDA amostra, para provar que vem a mais recente e não a primeira.
    await agente.telemetria({ CpuUsagePercentage: 77.25 });
    await esperarPor('a segunda amostra', async () => {
      const quantas = await prisma.telemetry.count({ where: { endpointId } });
      return quantas === 2 ? quantas : null;
    });

    // PRÉ-CONDIÇÃO COM NOME. `timestamp` tem resolução de milissegundo, e se as
    // duas amostras caíssem no mesmo a "mais recente" seria arbitrária — o caso
    // falharia dizendo que 42.5 não é 77.25, uma falha que não fala do motivo.
    // Entre as duas há uma ida e volta ao banco, então é improvável; a asserção
    // existe para que o dia improvável se explique.
    const marcas = await prisma.telemetry.findMany({
      where: { endpointId }, select: { timestamp: true },
    });
    expect(
      new Set(marcas.map((m) => m.timestamp.getTime())).size,
      'as duas amostras caíram no mesmo milissegundo: a ordenação por timestamp é arbitrária aqui',
    ).toBe(2);

    const { status, body } = await api.get<{
      id: string;
      hostname: string;
      status: string;
      telemetries: { cpuUsage: number; ramTotal: string }[];
    }>(`/api/endpoints/${endpointId}`);

    expect(status).toBe(200);
    expect(body.id).toBe(endpointId);
    expect(body.hostname).toBe('pc-do-comando');
    expect(body.status).toBe('ONLINE');

    // `take: 1`, e a mais nova.
    expect(body.telemetries).toHaveLength(1);
    expect(body.telemetries[0].cpuUsage).toBe(77.25);

    // Os BigInt saem como STRING: sem o `presentEndpoint`, o `JSON.stringify`
    // morre com "Do not know how to serialize a BigInt" — na rota que a ficha
    // consulta a cada poucos segundos.
    expect(typeof body.telemetries[0].ramTotal).toBe('string');
  });

  it('uuid que não é de máquina nenhuma é 404', async () => {
    const { status, body } = await api.get<{ error: string }>(`/api/endpoints/${UUID_QUE_NAO_EXISTE}`);

    expect(status).toBe(404);
    expect(body.error).toMatch(/m[áa]quina n[ãa]o encontrada/i);
  });

  it('id que não é uuid é 422, e não 500', async () => {
    // Sem o `idParamSchema` na borda, a string vai ao Prisma e volta como erro
    // de banco — 500 genérico no lugar de uma mensagem que diz o que está errado.
    const { status } = await api.get('/api/endpoints/nao-e-uuid');
    expect(status).toBe(422);
  });
});

describe('POST /api/endpoints/:id/command', () => {
  it('com o agente conectado, entrega o comando e devolve o identificador dele', async () => {
    const { status, body } = await api.post<{ message: string; commandId: string }>(
      `/api/endpoints/${endpointId}/command`,
      { action: 'reboot' },
    );

    expect(status).toBe(200);
    expect(body.commandId).toMatch(/^[0-9a-f-]{36}$/);

    // O PACOTE DO OUTRO LADO DO SOCKET: é isto que o 200 afirma. A ação vai em
    // maiúscula porque o schema normaliza — o agente recebe sempre assim.
    const pacote = await agente.receber('o comando chegar ao agente');
    expect(pacote).toEqual({
      Type: 'Command',
      Payload: { Action: 'REBOOT', CommandId: body.commandId },
    });
  });

  it('sem ação no corpo é 422', async () => {
    const { status } = await api.post(`/api/endpoints/${endpointId}/command`, {});
    expect(status).toBe(422);
  });

  it('uuid que não é de máquina nenhuma é 404', async () => {
    const { status, body } = await api.post<{ error: string }>(
      `/api/endpoints/${UUID_QUE_NAO_EXISTE}/command`,
      { action: 'reboot' },
    );

    expect(status).toBe(404);
    expect(body.error).toMatch(/m[áa]quina n[ãa]o encontrada/i);
  });

  it('máquina conhecida com agente desconectado é 409, e a mensagem diz qual é', async () => {
    // ESTE CASO ERA INDISTINGUÍVEL DO ANTERIOR. Com o hwid na URL, o use-case
    // não consultava o banco: "não existe" e "existe e está offline" eram o
    // mesmo 404. Agora o 404 é só o id morto, e isto é conflito com o estado.
    //
    // AGENTE PRÓPRIO, e não o do `beforeAll`: fechar aquele deixaria os casos
    // acima dependendo de rodar antes deste — e `status: 'ONLINE'` é asserção de
    // um deles. Com `.only` aqui, ou com uma repetição, o arquivo mudaria de
    // resultado pela ordem.
    const outro = await conectarAgente(api, 'maquina-que-vai-cair');
    await outro.handshake({ Hostname: 'pc-que-cai' });
    const caida = await esperarPor('a máquina que vai cair', () =>
      prisma.endpoint.findUnique({ where: { hwid: 'maquina-que-vai-cair' } }));

    await outro.fechar();

    // ESPERAR O SERVIDOR, não o cliente. O `fechar()` resolve no `close` do lado
    // de cá; quem tira o socket do registro é o `close` do lado do servidor, e os
    // dois são o mesmo processo mas não o mesmo instante. Sem esta espera,
    // `sendToAgent` acharia o socket obsoleto, devolveria `true`, e o teste
    // falharia com 200 de vez em quando — o pior tipo de vermelho.
    await esperarPor('a máquina virar OFFLINE', async () => {
      const agora = await prisma.endpoint.findUnique({
        where: { id: caida.id },
        select: { status: true },
      });
      return agora?.status === 'OFFLINE' ? agora : null;
    });

    const { status, body } = await api.post<{ error: string }>(
      `/api/endpoints/${caida.id}/command`,
      { action: 'shutdown' },
    );

    expect(status).toBe(409);
    // NOMEIA A MÁQUINA: quem está na tela precisa saber qual não respondeu.
    expect(body.error).toContain('pc-que-cai');
    expect(body.error).toMatch(/n[ãa]o fica em fila/i);
  });

  // ── O SOCKET QUE ESTÁ NO MAPA E NÃO ENTREGA ─────────────────────────────
  //
  // Os dois casos abaixo registram um socket FALSO sob o hwid de uma máquina
  // real, pelo `registerAgent` que o hub usa. É a única forma de prender o
  // instante que o caminho normal atravessa rápido demais para um teste pegar:
  // a conexão caiu, e o `close` do lado do servidor — que é quem tira o socket
  // do mapa — ainda não rodou. Com o agente de verdade, esse instante dura
  // menos que uma ida ao banco, e o teste seria intermitente.
  //
  // A máquina é real (houve handshake) para a rota passar da resolução do id e
  // chegar ao envio, que é o que está sob teste.

  async function maquinaComSocketFalso(hwid: string, hostname: string, socket: Partial<WebSocket>) {
    const real = await conectarAgente(api, hwid);
    await real.handshake({ Hostname: hostname });
    const maquina = await esperarPor(`a máquina ${hwid}`, () =>
      prisma.endpoint.findUnique({ where: { hwid } }));
    await real.fechar();
    // Esperar o servidor processar o `close`: senão o `unregisterAgent` dele
    // rodaria DEPOIS do registro abaixo — não removeria o falso, porque confere
    // a identidade do socket, mas marcaria a máquina offline no meio do caso.
    await esperarPor('a máquina virar OFFLINE', async () => {
      const agora = await prisma.endpoint.findUnique({ where: { id: maquina.id }, select: { status: true } });
      return agora?.status === 'OFFLINE' ? agora : null;
    });

    registerAgent(hwid, socket as WebSocket);
    return maquina.id;
  }

  it('socket no mapa que já está FECHANDO é 409, e não "Comando enviado"', async () => {
    const id = await maquinaComSocketFalso('maquina-fechando', 'pc-fechando', {
      OPEN: 1,
      readyState: 2, // CLOSING: o `close` do servidor ainda não tirou do mapa
      send: () => { throw new Error('o teste não deveria ter chegado ao send'); },
    } as unknown as Partial<WebSocket>);

    const { status, body } = await api.post<{ error: string }>(
      `/api/endpoints/${id}/command`,
      { action: 'shutdown' },
    );

    expect(status).toBe(409);
    expect(body.error).toContain('pc-fechando');
  });

  it('escrita que FALHA no socket é 502: nada foi entregue, e a resposta diz isso', async () => {
    const id = await maquinaComSocketFalso('maquina-que-nao-escreve', 'pc-sem-escrita', {
      OPEN: 1,
      readyState: 1,
      // O `ws` chama o callback com o erro quando a escrita falha — EPIPE, a
      // conexão fechada do outro lado no meio do caminho.
      send: (_dados: unknown, callback: (erro?: Error) => void) => callback(new Error('EPIPE')),
    } as unknown as Partial<WebSocket>);

    const { status, body } = await api.post<{ error: string }>(
      `/api/endpoints/${id}/command`,
      { action: 'shutdown' },
    );

    expect(status).toBe(502);
    expect(body.error).toContain('pc-sem-escrita');
    expect(body.error).toMatch(/nada foi entregue/i);
  });
});

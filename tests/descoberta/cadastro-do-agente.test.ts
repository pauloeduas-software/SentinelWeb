import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { prisma } from '../../server/infra/database/prismaClient';
import { isAgentConnected } from '../../server/modules/agent/agent.registry';
import { revogarAgente } from '../../server/modules/agent/cli/revogar-agente.cli';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { abrirConexao, cadastrarAgente, conectarAgente, esperarPor } from '../helpers/agente';

// O CADASTRO DO AGENTE E O TOKEN DE CADA MÁQUINA (CR).
//
// O `AGENT_ENROLL_SECRET` vale só no `POST /agent-hub/enroll`, que o troca por um
// token da máquina; o hub aceita só esse token, e a conexão fica presa ao HWID
// dele. O que este arquivo prova é o que o token único deixava acontecer: quem
// tinha o segredo se apresentava como qualquer máquina e recebia os comandos dela.

const SEGREDO = process.env.AGENT_ENROLL_SECRET ?? '';

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

const cadastrar = (corpo: unknown, segredo = SEGREDO) =>
  api.anonimo.post<{ Token?: string; error?: string }>('/agent-hub/enroll', corpo, {
    headers: { authorization: `Bearer ${segredo}` },
  });

describe('POST /agent-hub/enroll', () => {
  it('troca o segredo de instalação por um token da máquina, e o banco guarda só o hash', async () => {
    const resposta = await cadastrar({ Hwid: ' HWID-Cadastro-Novo ' });

    expect(resposta.status).toBe(201);
    const token = resposta.body.Token!;
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const credencial = await prisma.agentCredential.findUniqueOrThrow({ where: { hwid: 'hwid-cadastro-novo' } });
    expect(credencial.tokenHash).not.toBe(token);
    expect(credencial.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
  });

  it('recusa o segredo errado com 401, sem emitir token', async () => {
    const resposta = await cadastrar({ Hwid: 'hwid-segredo-errado' }, 'outro-segredo');

    expect(resposta.status).toBe(401);
    expect(await prisma.agentCredential.findUnique({ where: { hwid: 'hwid-segredo-errado' } })).toBeNull();
  });

  it('recusa o corpo sem HWID com 422', async () => {
    expect((await cadastrar({})).status).toBe(422);
    expect((await cadastrar({ Hwid: '   ' })).status).toBe(422);
  });
});

describe('o /agent-hub aceita só o token da máquina', () => {
  it('recusa o token que ninguém emitiu', async () => {
    await expect(abrirConexao(api, 'token-que-ninguem-emitiu')).rejects.toThrow('HTTP 401');
  });

  it('recusa o segredo de instalação: ele não abre o hub', async () => {
    await expect(abrirConexao(api, SEGREDO)).rejects.toThrow('HTTP 401');
  });

  it('fecha com 1008 a conexão que diz ser de outra máquina, sem tocar nela', async () => {
    const vitima = await conectarAgente(api, 'hwid-da-vitima');
    await vitima.handshake({ Hostname: 'pc-da-vitima' });
    await esperarPor('a vítima conectada', async () => isAgentConnected('hwid-da-vitima') || null);

    // Com o token de UMA máquina, o handshake se apresenta como a vítima (CU).
    const intruso = await abrirConexao(api, await cadastrarAgente(api, 'hwid-do-intruso'));
    const fechamento = new Promise<{ codigo: number; motivo: string }>((resolve) => {
      intruso.once('close', (codigo, motivo) => resolve({ codigo, motivo: motivo.toString() }));
    });
    intruso.send(JSON.stringify({ Type: 'Handshake', Payload: { Hwid: 'hwid-da-vitima', Hostname: 'pc-falso' } }));
    expect(await fechamento).toEqual({ codigo: 1008, motivo: 'HWID diferente do token' });

    // A mensagem com o HWID alheio não mudou a vítima, e o comando continua indo
    // para a conexão dela.
    const vitimaNoBanco = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'hwid-da-vitima' } });
    expect(vitimaNoBanco.hostname).toBe('pc-da-vitima');

    const comando = await api.post<{ commandId: string }>(`/api/endpoints/${vitimaNoBanco.id}/command`, { action: 'reboot' });
    expect(comando.status).toBe(200);
    expect(await vitima.receber('o comando da vítima')).toMatchObject({ Payload: { CommandId: comando.body.commandId } });

    await vitima.fechar();
  });
});

describe('o recadastro', () => {
  it('com a máquina conectada é 409, e a conexão dela continua', async () => {
    const agente = await conectarAgente(api, 'hwid-conectado');
    await agente.handshake();
    await esperarPor('a máquina conectada', async () => isAgentConnected('hwid-conectado') || null);

    const resposta = await cadastrar({ Hwid: 'hwid-conectado' });

    expect(resposta.status).toBe(409);
    expect(resposta.body.error).toMatch(/já está conectada/);
    expect(isAgentConnected('hwid-conectado')).toBe(true);
    await agente.fechar();
  });

  it('com a máquina desconectada troca o token, e o antigo para de valer', async () => {
    const antigo = await cadastrarAgente(api, 'hwid-reinstalado');
    const novo = await cadastrarAgente(api, 'hwid-reinstalado');

    expect(novo).not.toBe(antigo);
    await expect(abrirConexao(api, antigo)).rejects.toThrow('HTTP 401');
    (await abrirConexao(api, novo)).close();
  });
});

describe('a revogação', () => {
  it('apaga a credencial, fecha o hub para o token e fica na história da máquina', async () => {
    const agente = await conectarAgente(api, 'hwid-revogado');
    await agente.handshake({ Hostname: 'pc-revogado' });
    const maquina = await esperarPor('a máquina do handshake', () =>
      prisma.endpoint.findUnique({ where: { hwid: 'hwid-revogado' } }));
    await agente.fechar();

    expect(await revogarAgente('HWID-Revogado', 'cli:teste')).toBe(true);

    expect(await prisma.agentCredential.findUnique({ where: { hwid: 'hwid-revogado' } })).toBeNull();
    const linha = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'Endpoint', entityId: maquina.id, action: 'DELETE' },
    });
    expect(linha).toMatchObject({ entityLabel: 'pc-revogado', actorType: 'SYSTEM', source: 'cli:teste' });
  });

  it('o token revogado não abre o hub', async () => {
    const token = await cadastrarAgente(api, 'hwid-sem-maquina');

    expect(await revogarAgente('hwid-sem-maquina', 'cli:teste')).toBe(true);

    await expect(abrirConexao(api, token)).rejects.toThrow('HTTP 401');
  });

  it('do que não tem credencial não faz nada', async () => {
    expect(await revogarAgente('hwid-que-nunca-se-cadastrou', 'cli:teste')).toBe(false);
  });
});

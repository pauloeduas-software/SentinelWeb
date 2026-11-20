import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { prisma } from '../../server/infra/database/prismaClient';
import { registerHandshake } from '../../server/modules/endpoint/use-cases/register-handshake.usecase';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { abrirConexao, cadastrarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// EXCLUIR A MÁQUINA (DD) — a linha, a credencial do agente e a conexão aberta.
//
// O que este arquivo prova é que a máquina excluída NÃO VOLTA sozinha: nem pela
// conexão que estava aberta, nem pela reconexão com o token, nem por uma conexão
// aberta antes da exclusão que só manda o handshake depois. Volta com o agente
// cadastrado de novo, pelo segredo de instalação.

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

/** O código com que o servidor fecha a conexão. */
function fechamento(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once('close', (codigo) => resolve(codigo)));
}

function handshake(socket: WebSocket, hwid: string) {
  socket.send(JSON.stringify({ Type: 'Handshake', Payload: { Hwid: hwid, Hostname: `pc-${hwid}`, OsVersion: 'Ubuntu 24.04' } }));
}

/** Cadastra, conecta e manda o handshake: a máquina na lista, com a conexão aberta. */
async function maquinaConectada(hwid: string) {
  const token = await cadastrarAgente(api, hwid);
  const socket = await abrirConexao(api, token);
  handshake(socket, hwid);
  const maquina = await esperarPor(`a máquina ${hwid}`, () => prisma.endpoint.findUnique({ where: { hwid } }));
  return { token, socket, maquina };
}

describe('DELETE /api/endpoints/:id', () => {
  it('apaga a máquina e a credencial, fecha a conexão, e a reconexão leva 401', async () => {
    const { token, socket, maquina } = await maquinaConectada('excluida-1');
    const fechou = fechamento(socket);

    const resposta = await api.delete<{ message: string }>(`/api/endpoints/${maquina.id}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toBe('Máquina excluída.');
    expect(await fechou).toBe(1008);
    expect(await prisma.endpoint.findUnique({ where: { id: maquina.id } })).toBeNull();
    expect(await prisma.agentCredential.findUnique({ where: { hwid: 'excluida-1' } })).toBeNull();
    await expect(abrirConexao(api, token)).rejects.toThrow('HTTP 401');

    // Na auditoria, com quem excluiu: o nome e o HWID ficam por escrito.
    const linha = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'Endpoint', entityId: maquina.id, action: 'DELETE' },
    });
    expect(linha).toMatchObject({ entityLabel: 'pc-excluida-1', actorType: 'USER' });
    expect(linha.changes).toMatchObject({ hwid: { de: 'excluida-1', para: null } });
  });

  it('a conexão aberta antes da exclusão não recria a máquina com o handshake de depois', async () => {
    const { token, maquina } = await maquinaConectada('excluida-2');
    // Passou pelo token na abertura, quando a credencial ainda existia.
    const atrasada = await abrirConexao(api, token);

    expect((await api.delete(`/api/endpoints/${maquina.id}`)).status).toBe(200);

    const fechou = fechamento(atrasada);
    handshake(atrasada, 'excluida-2');
    expect(await fechou).toBe(1008);
    expect(await prisma.endpoint.findUnique({ where: { hwid: 'excluida-2' } })).toBeNull();
  });

  it('o handshake que a exclusão alcança depois da conferência da credencial não recria a máquina', async () => {
    const { socket, maquina } = await maquinaConectada('excluida-3');
    expect((await api.delete(`/api/endpoints/${maquina.id}`)).status).toBe(200);
    socket.close();

    // A gravação direto: o maestro já conferiu a credencial, e a exclusão confirmou depois.
    const gravada = await registerHandshake({
      hwid: 'excluida-3', hostname: 'pc-excluida-3', osVersion: 'Windows 11', macAddress: null, localIp: null,
      cpuModel: null, biosSerial: null, systemUuid: null, manufacturer: null, hardwareModel: null, gpus: undefined,
      agentVersion: null,
    });

    expect(gravada).toBeNull();
    expect(await prisma.endpoint.findUnique({ where: { hwid: 'excluida-3' } })).toBeNull();
  });

  it('recusa a máquina com computador, com o computador em link, e não mexe em nada', async () => {
    const { socket, maquina } = await maquinaConectada('excluida-vinculada');
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Computador da máquina excluída' });
    await api.post(`/api/endpoints/${maquina.id}/link`, { assetId: ativo.id });

    const { status, body } = await api.delete<{ error: string; refs: unknown[] }>(`/api/endpoints/${maquina.id}`);

    expect(status).toBe(409);
    expect(body.error).toBe(`A máquina pc-excluida-vinculada está vinculada a ${ativo.assetTag}. Desvincule antes de excluir.`);
    expect(body.refs).toEqual([{ tipo: 'ativo', id: ativo.id, nome: ativo.assetTag }]);
    expect(await prisma.endpoint.findUnique({ where: { id: maquina.id } })).not.toBeNull();
    expect(await prisma.agentCredential.findUnique({ where: { hwid: 'excluida-vinculada' } })).not.toBeNull();
    socket.close();
  });

  it('é do Supervisor: o Técnico leva 403', async () => {
    const { socket, maquina } = await maquinaConectada('excluida-tecnico');
    const tecnico = await api.comoUsuario('TECNICO');

    expect((await tecnico.delete(`/api/endpoints/${maquina.id}`)).status).toBe(403);
    expect(await prisma.endpoint.findUnique({ where: { id: maquina.id } })).not.toBeNull();
    socket.close();
  });

  it('a máquina que não existe é 404', async () => {
    const { status, body } = await api.delete<{ error: string }>('/api/endpoints/00000000-0000-4000-8000-000000000000');
    expect(status).toBe(404);
    expect(body.error).toBe('Máquina não encontrada.');
  });
});

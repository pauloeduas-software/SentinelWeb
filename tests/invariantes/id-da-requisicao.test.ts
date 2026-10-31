import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// O ID DA REQUISIÇÃO É DO SERVIDOR.
//
// Ele vai para a auditoria como a prova de qual requisição fez a alteração
// (AB). Aceito do cliente, uma conta repetiria o id de outra requisição — até
// de outra conta — e duas linhas diriam a mesma coisa.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

describe('o X-Request-Id mandado pelo cliente', () => {
  it('é ignorado: a resposta e a auditoria levam o id que o servidor gerou', async () => {
    const escolhido = 'id-escolhido-pelo-cliente';
    const resposta = await api.post<{ id: string }>(
      '/api/manufacturers',
      { name: 'Fabricante do Id da Requisição' },
      { headers: { 'x-request-id': escolhido } },
    );
    expect(resposta.status).toBe(201);

    const devolvido = resposta.headers['x-request-id'];
    expect(devolvido).not.toBe(escolhido);

    const linha = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: resposta.body.id, action: 'CREATE' },
    });
    expect(linha.requestId).toBe(devolvido);
  });
});

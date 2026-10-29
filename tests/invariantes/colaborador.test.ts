import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo, criarColaborador } from '../helpers/fixtures';

// O COLABORADOR — a sexta tabela do catálogo, com página própria, e a única com LIXEIRA.
//
// Ele tem histórico de posse PRÓPRIO ("o que já esteve com a Laura"), e
// recadastrá-lo depois de excluir o partiria em dois. Então excluir manda para
// a lixeira: a linha fica, o histórico continua com o nome, e restaurar devolve
// a MESMA pessoa. Só recusa quem responde por algo AGORA (invariante 6).

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

async function entregarNotebook(pessoa: string) {
  const notebook = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });
  expect((await api.post(`/api/assets/${notebook.id}/checkout`, {
    targetType: 'PERSON', targetPersonId: pessoa,
  })).status).toBe(201);
  return notebook;
}

describe('excluir colaborador', () => {
  it('com o notebook na mão, recusa — e a frase diz o que devolver', async () => {
    const pessoa = await criarColaborador(api, { name: 'Com Notebook', email: 'com.notebook@teste.local' });
    await entregarNotebook(pessoa);

    const recusa = await api.delete<{ error: string }>(`/api/people/${pessoa}`);
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toContain('responde por 1 ativo');
    expect(recusa.body.error).toContain('antes de excluir');
  });

  it('o notebook dela não vai para a lixeira antes da devolução — e ela não se desativa por baixo (AL)', async () => {
    const pessoa = await criarColaborador(api, { name: 'Notebook na Lixeira', email: 'notebook.lixeira@teste.local' });
    const notebook = await entregarNotebook(pessoa);

    const recusa = await api.delete<{ error: string }>(`/api/assets/${notebook.id}`);
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toBe('Este ativo está entregue e não pode ir para a lixeira. Faça a devolução antes.');

    // O notebook continua no nome dela, e a desativação continua vendo.
    expect((await api.put(`/api/people/${pessoa}`, { isActive: false })).status).toBe(409);

    // Devolvido, vai para a lixeira e volta sem apontar para ninguém.
    expect((await api.post(`/api/assets/${notebook.id}/checkin`, {})).status).toBe(200);
    expect((await api.delete(`/api/assets/${notebook.id}`)).status).toBe(200);
    expect((await api.put(`/api/people/${pessoa}`, { isActive: false })).status).toBe(200);
    expect((await api.post(`/api/assets/${notebook.id}/restore`)).status).toBe(200);
    expect(await prisma.assignment.count({ where: { assetId: notebook.id, checkinAt: null } })).toBe(0);
  });

  it('quem já devolveu vai para a lixeira, e o histórico do ativo continua com o nome', async () => {
    const pessoa = await criarColaborador(api, { name: 'Já Teve Notebook', email: 'ja.teve@teste.local' });
    const notebook = await entregarNotebook(pessoa);
    expect((await api.post(`/api/assets/${notebook.id}/checkin`, {})).status).toBe(200);

    expect((await api.delete(`/api/people/${pessoa}`)).status).toBe(200);

    // A linha FICA — é a lixeira, não um apagão.
    const linha = await prisma.person.findFirst({ where: { id: pessoa, deletedAt: { not: null } } });
    expect(linha).not.toBeNull();

    // Some de toda leitura: ficha, seletor, listagem.
    expect((await api.get(`/api/people/${pessoa}`)).status).toBe(404);
    const opcoes = await api.get<{ id: string }[]>(`/api/people/options?q=${encodeURIComponent('Já Teve')}`);
    expect(opcoes.body.map((opcao) => opcao.id)).not.toContain(pessoa);

    // E o histórico do notebook continua dizendo com quem ele esteve.
    const historico = await api.get<{ rows: { action: string; posse: { targetLabel: string | null } | null }[] }>(
      `/api/assets/${notebook.id}/history`,
    );
    expect(historico.body.rows.find((evento) => evento.action === 'CHECKOUT')?.posse?.targetLabel).toBe('Já Teve Notebook');
  });

  it('na lixeira não recebe entrega (404)', async () => {
    const pessoa = await criarColaborador(api, { name: 'Na Lixeira', email: 'na.lixeira@teste.local' });
    expect((await api.delete(`/api/people/${pessoa}`)).status).toBe(200);

    const notebook = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });
    expect((await api.post(`/api/assets/${notebook.id}/checkout`, {
      targetType: 'PERSON', targetPersonId: pessoa,
    })).status).toBe(404);
  });
});

describe('a lixeira de colaboradores', () => {
  interface Envelope { rows: { id: string; name: string }[] }

  it('lista o excluído em `?view=trashed`, e restaurar devolve a MESMA pessoa', async () => {
    const pessoa = await criarColaborador(api, { name: 'Volta da Lixeira', email: 'volta@teste.local' });
    expect((await api.delete(`/api/people/${pessoa}`)).status).toBe(200);

    const lixeira = await api.get<Envelope>('/api/people?view=trashed&q=Volta');
    expect(lixeira.body.rows.map((linha) => linha.id)).toEqual([pessoa]);
    const ativos = await api.get<Envelope>('/api/people?q=Volta');
    expect(ativos.body.rows).toHaveLength(0);

    expect((await api.post(`/api/people/${pessoa}/restore`)).status).toBe(200);
    expect((await api.get(`/api/people/${pessoa}`)).status).toBe(200);

    // A auditoria conta a ida e a volta, com a conta que as fez (AB).
    const auditoria = await prisma.auditLog.findMany({
      where: { entityType: 'Person', entityId: pessoa, action: { in: ['DELETE', 'RESTORE'] } },
      select: { action: true, actorId: true },
    });
    expect(auditoria.map((l) => l.action).sort()).toEqual(['DELETE', 'RESTORE']);
    expect(auditoria.every((l) => l.actorId === api.adminId)).toBe(true);
  });

  it('o e-mail fica livre na lixeira, e restaurar recusa (409) se ele foi reaproveitado', async () => {
    const antiga = await criarColaborador(api, { name: 'Ana Antiga', email: 'ana.reaproveitada@teste.local' });
    expect((await api.delete(`/api/people/${antiga}`)).status).toBe(200);

    await criarColaborador(api, { name: 'Ana Nova', email: 'ana.reaproveitada@teste.local' });

    const restauracao = await api.post<{ error: string }>(`/api/people/${antiga}/restore`);
    expect(restauracao.status).toBe(409);
    expect(restauracao.body.error).toMatch(/e-mail/i);
  });

  it('restaurar quem não está na lixeira é 404', async () => {
    const pessoa = await criarColaborador(api, { name: 'Nunca Excluída', email: 'nunca@teste.local' });
    expect((await api.post(`/api/people/${pessoa}/restore`)).status).toBe(404);
  });

  it('as outras abas do catálogo continuam sem lixeira', async () => {
    expect((await api.get('/api/locations?view=trashed')).status).toBe(422);
  });
});

describe('desativar colaborador', () => {
  it('desativado some do seletor da entrega', async () => {
    const pessoa = await criarColaborador(api, { name: 'Saiu da Empresa', email: 'saiu@teste.local' });
    expect((await api.put(`/api/people/${pessoa}`, { isActive: false })).status).toBe(200);

    const opcoes = await api.get<{ id: string }[]>(`/api/people/options?q=${encodeURIComponent('Saiu da Empresa')}`);
    expect(opcoes.body.map((opcao) => opcao.id)).not.toContain(pessoa);
  });
});

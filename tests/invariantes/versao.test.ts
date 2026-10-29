import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarItemDeEstoque, criarLicenca, criarPosto } from '../helpers/fixtures';

// O EDITAR CONFERE A VERSÃO QUE LEU (AF).
//
// O formulário manda o `updatedAt` com que abriu. Se a linha mudou desde então
// — outra pessoa editou, encerrou, entregou o computador —, o servidor responde
// 409 e não grava por cima. Sem a versão no corpo (o Desativar, o Reabrir, quem
// chama por fora), não confere.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api, ' da versão');
});

afterAll(async () => {
  await api.fechar();
});

const frase = (nome: string) =>
  `Outra pessoa salvou "${nome}" enquanto você editava. Feche e abra de novo para ver o que mudou.`;

type ComVersao = { updatedAt: string };

describe('o Editar com a versão velha é recusado', () => {
  it('no cadastro das Configurações: 409, nada gravado; a versão atual e a ausente passam', async () => {
    const criado = await api.post<ComVersao & { id: string }>('/api/manufacturers', { name: 'Fabricante da versão' });
    expect(criado.status).toBe(201);
    const { id, updatedAt: lida } = criado.body;

    // Outra pessoa salva no meio.
    const outra = await api.put<ComVersao>(`/api/manufacturers/${id}`, { supportPhone: '1133334444' });
    expect(outra.status).toBe(200);

    const velha = await api.put<{ error: string }>(`/api/manufacturers/${id}`, {
      name: 'Nome do formulário velho', supportPhone: null, updatedAt: lida,
    });
    expect(velha.status).toBe(409);
    expect(velha.body.error).toBe(frase('Fabricante da versão'));

    expect(await prisma.manufacturer.findUniqueOrThrow({ where: { id }, select: { name: true, supportPhone: true } }))
      .toEqual({ name: 'Fabricante da versão', supportPhone: '1133334444' });

    expect((await api.put(`/api/manufacturers/${id}`, { name: 'Fabricante da versão nova', updatedAt: outra.body.updatedAt })).status).toBe(200);
    expect((await api.put(`/api/manufacturers/${id}`, { supportPhone: '1144445555' })).status).toBe(200);
  });

  it('na licença: o formulário aberto antes do Encerrar não a reabre', async () => {
    const licenca = await criarLicenca(api, { name: 'Licença da versão', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    const lida = (await api.get<ComVersao>(`/api/licenses/${licenca.id}`)).body.updatedAt;

    expect((await api.post(`/api/licenses/${licenca.id}/terminate`)).status).toBe(200);

    const velha = await api.put<{ error: string }>(`/api/licenses/${licenca.id}`, {
      notes: 'só as notas', terminationDate: null, updatedAt: lida,
    });
    expect(velha.status).toBe(409);
    expect(velha.body.error).toBe(frase('Licença da versão'));
    expect((await api.get<{ status: string }>(`/api/licenses/${licenca.id}`)).body.status).toBe('ENCERRADA');

    // A entrega grava em outra tabela: não esbarra no Editar aberto.
    const reaberta = await api.put<ComVersao>(`/api/licenses/${licenca.id}`, { terminationDate: null });
    const atual = reaberta.body.updatedAt;
    await api.post(`/api/licenses/${licenca.id}/checkout`, { assignedPersonId: cenario.laura });
    expect((await api.put(`/api/licenses/${licenca.id}`, { notes: 'agora sim', updatedAt: atual })).status).toBe(200);
  });

  it('no estoque: o total que outra pessoa aumentou não volta', async () => {
    const item = await criarItemDeEstoque(api, { name: 'Mouse da versão', categoryId: cenario.categoriaEstoqueId, qty: 5 });
    const lida = (await api.get<ComVersao>(`/api/stock/items/${item.id}`)).body.updatedAt;

    expect((await api.put(`/api/stock/items/${item.id}`, { qty: 10 })).status).toBe(200);

    const velha = await api.put<{ error: string }>(`/api/stock/items/${item.id}`, { qty: 5, updatedAt: lida });
    expect(velha.status).toBe(409);
    expect(velha.body.error).toBe(frase('Mouse da versão'));
    expect((await api.get<{ qty: number }>(`/api/stock/items/${item.id}`)).body.qty).toBe(10);
  });

  it('no consumível: a entrega tira do total, e o formulário velho não o devolve', async () => {
    const item = await criarItemDeEstoque(api, { name: 'Toner da versão', categoryId: cenario.categoriaConsumivelId, qty: 5 });
    const lida = (await api.get<ComVersao>(`/api/stock/items/${item.id}`)).body.updatedAt;

    const entrega = await api.post(`/api/stock/items/${item.id}/checkout`, { targetType: 'PERSON', targetPersonId: cenario.laura, qty: 2 });
    expect(entrega.status).toBe(201);

    const velha = await api.put<{ error: string }>(`/api/stock/items/${item.id}`, { qty: 5, updatedAt: lida });
    expect(velha.status).toBe(409);
    expect(velha.body.error).toBe(frase('Toner da versão'));
    expect((await api.get<{ qty: number }>(`/api/stock/items/${item.id}`)).body.qty).toBe(3);
  });

  it('no computador: a entrega troca o status, e o formulário velho não o desfaz', async () => {
    const ativo = await api.get<ComVersao & { assetTag: string; statusId: string }>(`/api/assets/${cenario.ativo.id}`);
    const entrega = await api.post(`/api/assets/${cenario.ativo.id}/checkout`, { targetType: 'PERSON', targetPersonId: cenario.ana });
    expect(entrega.status).toBe(201);

    const velha = await api.put<{ error: string }>(`/api/assets/${cenario.ativo.id}`, {
      statusId: ativo.body.statusId, name: 'Do formulário velho', updatedAt: ativo.body.updatedAt,
    });
    expect(velha.status).toBe(409);
    expect(velha.body.error).toBe(frase(ativo.body.assetTag));
  });

  it('no posto, que usa o cadastro das Configurações', async () => {
    const id = await criarPosto(api, { name: 'Mesa da versão' });
    const primeira = await api.put<ComVersao>(`/api/workstations/${id}`, { notes: 'primeira' });
    const segunda = await api.put<ComVersao>(`/api/workstations/${id}`, { notes: 'segunda' });

    const velha = await api.put<{ error: string }>(`/api/workstations/${id}`, {
      name: 'Mesa renomeada', updatedAt: primeira.body.updatedAt,
    });
    expect(velha.status).toBe(409);
    expect(velha.body.error).toBe(frase('Mesa da versão'));
    expect((await api.put(`/api/workstations/${id}`, { name: 'Mesa renomeada', updatedAt: segunda.body.updatedAt })).status).toBe(200);
  });

  it('a versão que não é data e hora é 422', async () => {
    const id = await criarPosto(api, { name: 'Mesa da versão torta' });
    const torta = await api.put<{ error: string }>(`/api/workstations/${id}`, { name: 'x', updatedAt: 'ontem' });
    expect(torta.status).toBe(422);
    expect(torta.body.error).toContain('updatedAt: use a data e hora que a leitura devolveu');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// INVARIANTE 3 — o tipo de um status em uso não muda (`docs/INVARIANTES.md`).
//
// É a única das quatro que mora inteiramente na APLICAÇÃO, e a razão está na
// forma da regra: "mudou de X para Y **e** há quem aponte". Precisa do valor
// anterior e de um `COUNT` em outra tabela — nem índice nem CHECK fazem isso.
//
// O que ela impede é uma escrita que não deixa rastro: trocar o `type` de um
// `StatusLabel` que 200 ativos usam muda o significado dos 200 DE UMA VEZ, sem
// escrever uma linha em `assets` e portanto sem `ActivityLog` nenhum.
// "Pronto p/ Uso" virando `ARCHIVED` arquiva a frota em silêncio.

let api: ApiDeTeste;
let modelId = '';
let categoriaId = '';

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  categoriaId = seed.categoriaId;
  const fabricanteId = await criarFabricante(api);
  modelId = await criarModelo(api, { categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

describe('StatusLabel', () => {
  it('deixa mudar o tipo enquanto NINGUÉM usa', async () => {
    const criado = await api.post<{ id: string }>('/api/status-labels', {
      name: 'Status sem uso',
      type: 'DEPLOYABLE',
    });
    expect(criado.status).toBe(201);

    const { status } = await api.put(`/api/status-labels/${criado.body.id}`, { type: 'ARCHIVED' });
    expect(status).toBe(200);
  });

  it('recusa mudar o tipo de um status EM USO, dizendo quantos', async () => {
    const criado = await api.post<{ id: string }>('/api/status-labels', {
      name: 'Status em uso',
      type: 'DEPLOYABLE',
    });
    await criarAtivo(api, { statusId: criado.body.id, modelId, name: 'Ativo que segura o status' });

    const { status, body } = await api.put<{ error: string }>(`/api/status-labels/${criado.body.id}`, {
      type: 'ARCHIVED',
    });

    expect(status).toBe(409);
    // O 409 genérico do banco não diria QUANTOS — e o número é o que faz o
    // operador entender o tamanho do estrago que acabou de ser evitado.
    expect(body.error).toMatch(/1/);
  });

  it('deixa renomear um status em uso — só o TIPO é que trava', async () => {
    // A recusa é estreita de propósito: mudar a cor, o nome ou as notas de um
    // status em uso é edição normal e não muda o significado de ativo nenhum.
    const criado = await api.post<{ id: string }>('/api/status-labels', {
      name: 'Status renomeável',
      type: 'DEPLOYABLE',
    });
    await criarAtivo(api, { statusId: criado.body.id, modelId, name: 'Ativo do rename' });

    const { status } = await api.put(`/api/status-labels/${criado.body.id}`, { name: 'Nome novo' });
    expect(status).toBe(200);
  });
});

describe('Category', () => {
  it('recusa mudar o tipo de uma categoria em uso', async () => {
    // Mais grave que o status: o tipo da categoria diz a que MÓDULO o registro
    // pertence. Um modelo de ativo pendurado numa categoria que virou LICENSE
    // sai do inventário sem nada ter sido apagado.
    const { status, body } = await api.put<{ error: string }>(`/api/categories/${categoriaId}`, {
      type: 'LICENSE',
    });

    expect(status).toBe(409);
    expect(body.error).toMatch(/\d/);
  });
});

describe('o catálogo não tem lixeira (D8) — a proteção é o 409 por uso', () => {
  it('recusa apagar um fabricante que tem modelo', async () => {
    const { status, body } = await api.delete<{ error: string }>(
      `/api/manufacturers/${(await api.get<{ rows: { id: string }[] }>('/api/manufacturers')).body.rows[0].id}`,
    );

    expect(status).toBe(409);
    expect(body.error).toMatch(/\d/);
  });

  it('não expõe rota de restauração no catálogo', async () => {
    // Não há lixeira, então não há o que restaurar. A rota existir seria a
    // promessa de uma lixeira que não existe.
    const { status } = await api.post('/api/manufacturers/00000000-0000-4000-8000-000000000000/restore');
    expect(status).toBe(404);
  });
});

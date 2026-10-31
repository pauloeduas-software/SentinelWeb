import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarFabricante, criarLicenca, criarModelo, idsDoSeed,
} from '../helpers/fixtures';
import { prisma } from '../../server/infra/database/prismaClient';

// INVARIANTE 3 — o tipo de um status em uso não muda (`docs/referencia/invariantes.md`).
//
// É a única das quatro que mora inteiramente na APLICAÇÃO, e a razão está na
// forma da regra: "mudou de X para Y **e** há quem aponte". Precisa do valor
// anterior e de um `COUNT` em outra tabela — nem índice nem CHECK fazem isso.
//
// O que ela impede é uma escrita que não deixa rastro: trocar o `type` de um
// `StatusLabel` que 200 ativos usam muda o significado dos 200 DE UMA VEZ, sem
// escrever uma linha em `assets` e portanto sem `AuditLog` nenhum.
// Um status disponível virando `UNDEPLOYABLE` inutiliza a frota em silêncio.

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
  it('recusa o tipo ARCHIVED — quem sai de vez é baixado', async () => {
    const { status } = await api.post('/api/status-labels', { name: 'Arquivado', type: 'ARCHIVED' });
    expect(status).toBe(422);
  });

  it('deixa mudar o tipo enquanto NINGUÉM usa', async () => {
    const criado = await api.post<{ id: string }>('/api/status-labels', {
      name: 'Status sem uso',
      type: 'DEPLOYABLE',
    });
    expect(criado.status).toBe(201);

    const { status } = await api.put(`/api/status-labels/${criado.body.id}`, { type: 'UNDEPLOYABLE' });
    expect(status).toBe(200);
  });

  it('recusa mudar o tipo de um status EM USO, dizendo quantos', async () => {
    const criado = await api.post<{ id: string }>('/api/status-labels', {
      name: 'Status em uso',
      type: 'DEPLOYABLE',
    });
    await criarAtivo(api, { statusId: criado.body.id, modelId, name: 'Ativo que segura o status' });

    const { status, body } = await api.put<{ error: string }>(`/api/status-labels/${criado.body.id}`, {
      type: 'UNDEPLOYABLE',
    });

    expect(status).toBe(409);
    // O 409 genérico do banco não diria QUANTOS — e o número é o que faz o
    // operador entender o tamanho do estrago que acabou de ser evitado.
    expect(body.error).toMatch(/1/);
  });

  it('deixa renomear um status em uso — só o TIPO é que trava', async () => {
    // A recusa é estreita de propósito: mudar o nome ou as notas de um
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

// ── A LICENÇA SEGURA A CATEGORIA E O FABRICANTE ─────────────────────────────
//
// As duas contagens esqueciam a licença: a categoria de LICENÇA trocava de tipo
// com licenças dentro, e o delete dava 0 e caía no P2003 cru ("em uso por outro
// cadastro"), sem o número. A licença da LIXEIRA conta: a FK é `Restrict` e
// segura do mesmo jeito.

/** Uma categoria nova, pela API. */
async function categoria(name: string, type: 'ASSET' | 'LICENSE' | 'STOCK') {
  const criada = await api.post<{ id: string }>('/api/categories', { name, type });
  expect(criada.status, JSON.stringify(criada.body)).toBe(201);
  return criada.body.id;
}

describe('Category — a licença conta como uso', () => {
  it('recusa excluir a categoria usada SÓ por uma licença, dizendo quantas', async () => {
    const id = await categoria('Família só de licença', 'LICENSE');
    await criarLicenca(api, { name: 'Licença que segura a categoria', categoryId: id, seatsTotal: 1 });

    const { status, body } = await api.delete<{ error: string }>(`/api/categories/${id}`);
    expect(status).toBe(409);
    expect(body.error).toMatch(/1 registro/);
  });

  it('e a licença ENCERRADA também segura: ela continua na lista, encerrada', async () => {
    const id = await categoria('Família da encerrada', 'LICENSE');
    await criarLicenca(api, { name: 'Licença encerrada', categoryId: id, seatsTotal: 1, terminationDate: '2020-01-01' });

    const { status, body } = await api.delete<{ error: string }>(`/api/categories/${id}`);
    expect(status).toBe(409);
    expect(body.error).toMatch(/1 registro/);
  });

  it('recusa trocar o tipo da categoria de LICENÇA que tem licença dentro', async () => {
    // Sem a guarda, toda edição da licença passava a dar 422 no tipo da
    // categoria — e ninguém sabia por quê.
    const id = await categoria('Família que não muda', 'LICENSE');
    await criarLicenca(api, { name: 'Licença que prende o tipo', categoryId: id, seatsTotal: 1 });

    const { status, body } = await api.put<{ error: string }>(`/api/categories/${id}`, { type: 'ASSET' });
    expect(status).toBe(409);
    expect(body.error).toMatch(/1 registro/);
  });
});

describe('Manufacturer — a licença conta como uso', () => {
  async function licencaDoFabricante(name: string, manufacturerId: string) {
    const seed = await idsDoSeed();
    const criada = await api.post<{ id: string }>('/api/licenses', {
      name, categoryId: seed.categoriaLicencaId, seatsTotal: 1, manufacturerId,
    });
    expect(criada.status, JSON.stringify(criada.body)).toBe(201);
    return criada.body.id;
  }

  it('recusa excluir o fabricante usado SÓ por uma licença, dizendo quantas', async () => {
    const id = await criarFabricante(api, 'Fabricante só de licença');
    await licencaDoFabricante('Licença do fabricante', id);

    const { status, body } = await api.delete<{ error: string }>(`/api/manufacturers/${id}`);
    expect(status).toBe(409);
    expect(body.error).toMatch(/1 registro/);
  });

  it('e a licença excluída de vez solta o fabricante', async () => {
    const id = await criarFabricante(api, 'Fabricante da licença apagada');
    const licenca = await licencaDoFabricante('Licença apagada do fabricante', id);
    expect((await api.delete(`/api/licenses/${licenca}`)).status).toBe(204);

    expect((await api.delete(`/api/manufacturers/${id}`)).status).toBe(200);
  });
});

// ── AS REFERÊNCIAS DO MODELO ────────────────────────────────────────────────
//
// O ativo herda a categoria do modelo: um modelo numa categoria de licença ou
// de estoque leva todos os ativos dele para fora da tela de Ativos. E um id
// inexistente caía no P2003, que diz "em uso" para o que não existe.

describe('AssetModel — as referências são conferidas antes de gravar', () => {
  const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
  let fabricanteId = '';

  beforeAll(async () => {
    fabricanteId = await criarFabricante(api, 'Fabricante dos modelos');
  });

  it('recusa fabricante inexistente com 404', async () => {
    const { status, body } = await api.post<{ error: string }>('/api/asset-models', {
      name: 'Modelo sem fabricante', manufacturerId: INEXISTENTE, categoryId: categoriaId,
    });
    expect(status).toBe(404);
    expect(body.error).toMatch(/fabricante/i);
  });

  it('recusa categoria inexistente com 404', async () => {
    const { status, body } = await api.post<{ error: string }>('/api/asset-models', {
      name: 'Modelo sem categoria', manufacturerId: fabricanteId, categoryId: INEXISTENTE,
    });
    expect(status).toBe(404);
    expect(body.error).toMatch(/categoria/i);
  });

  it('recusa categoria de LICENÇA ou de ESTOQUE com 422, no cadastro', async () => {
    const seed = await idsDoSeed();
    for (const categoryId of [seed.categoriaLicencaId, seed.categoriaEstoqueId]) {
      const { status } = await api.post('/api/asset-models', {
        name: 'Modelo na categoria errada', manufacturerId: fabricanteId, categoryId,
      });
      expect(status).toBe(422);
    }
  });

  it('e na edição — o PUT é o que movia os ativos de lugar', async () => {
    const seed = await idsDoSeed();
    const id = await criarModelo(api, { categoriaId, fabricanteId, name: 'Modelo que fica em ATIVO' });

    for (const categoryId of [seed.categoriaLicencaId, seed.categoriaEstoqueId]) {
      const { status } = await api.put(`/api/asset-models/${id}`, { categoryId });
      expect(status).toBe(422);
    }

    const depois = await prisma.assetModel.findUniqueOrThrow({ where: { id }, select: { categoryId: true } });
    expect(depois.categoryId).toBe(categoriaId);
  });

  it('recusa número de modelo repetido no MESMO fabricante, nomeando o dono', async () => {
    const primeiro = await api.post('/api/asset-models', {
      name: 'Latitude Original', manufacturerId: fabricanteId, categoryId: categoriaId, modelNumber: 'LAT-5440',
    });
    expect(primeiro.status).toBe(201);

    const { status, body } = await api.post<{ error: string }>('/api/asset-models', {
      name: 'Latitude Cópia', manufacturerId: fabricanteId, categoryId: categoriaId, modelNumber: 'LAT-5440',
    });
    expect(status).toBe(409);
    // A colisão crua diria só "Registro já existe" — sem dizer QUAL modelo.
    expect(body.error).toContain('Latitude Original');
  });
});

// ── O NOME ÚNICO SEM DIFERENÇA DE MAIÚSCULA ─────────────────────────────────
//
// O índice compara byte a byte: "Dell" e "dell" passavam os dois e apareciam
// duplicados em todo `<select>`.

describe('nome único sem diferença de maiúscula', () => {
  it('recusa o fabricante "dell" quando já há "Dell"', async () => {
    await criarFabricante(api, 'Dell');

    const { status, body } = await api.post<{ error: string }>('/api/manufacturers', { name: 'dell' });
    expect(status).toBe(409);
    expect(body.error).toMatch(/Já existe fabricante com o nome "Dell"/);
  });

  it('na categoria, o nome é único POR TIPO', async () => {
    // "Notebook" de ATIVO vem do seed.
    const mesmoTipo = await api.post<{ error: string }>('/api/categories', { name: 'notebook', type: 'ASSET' });
    expect(mesmoTipo.status).toBe(409);
    expect(mesmoTipo.body.error).toMatch(/Já existe categoria com o nome "Notebook" neste tipo/);

    // A mesma palavra em outro tipo é outra linha: é para isso que o tipo existe.
    const outroTipo = await api.post('/api/categories', { name: 'notebook', type: 'LICENSE' });
    expect(outroTipo.status).toBe(201);
  });

  it('deixa o próprio registro trocar só a caixa do nome', async () => {
    // Sem o `id: { not }`, o registro colidiria consigo mesmo e nunca mais
    // poderia corrigir "lenovo" para "Lenovo".
    const id = await criarFabricante(api, 'lenovo');
    const { status, body } = await api.put<{ name: string }>(`/api/manufacturers/${id}`, { name: 'Lenovo' });
    expect(status).toBe(200);
    expect(body.name).toBe('Lenovo');

    const cat = await categoria('tablet', 'ASSET');
    expect((await api.put(`/api/categories/${cat}`, { name: 'Tablet' })).status).toBe(200);
  });
});

// ── O ENDEREÇO DO SITE É http/https ─────────────────────────────────────────
//
// O valor vira `href` na tela: `javascript:` ali é script de quem cadastrou
// rodando na sessão de quem clica. E `dell.com` sem esquema vira link relativo
// para dentro do próprio painel.

describe('URL do fabricante', () => {
  it('recusa `javascript:` com 422', async () => {
    const { status, body } = await api.post('/api/manufacturers', { name: 'Fabricante JS', url: 'javascript:alert(1)' });
    expect(status).toBe(422);
    expect(JSON.stringify(body)).toMatch(/site/);
  });

  it('recusa o endereço sem esquema com 422', async () => {
    const { status } = await api.post('/api/manufacturers', { name: 'Fabricante sem esquema', url: 'dell.com' });
    expect(status).toBe(422);
  });

  it('aceita o endereço completo com https://', async () => {
    const { status } = await api.post('/api/manufacturers', { name: 'Fabricante com site', url: 'https://dell.com' });
    expect(status).toBe(201);
  });

  it('a recusa diz QUAL campo — o site', async () => {
    const { status, body } = await api.post('/api/manufacturers', {
      name: 'Fabricante do site ruim', url: 'javascript:alert(1)',
    });
    expect(status).toBe(422);
    expect(JSON.stringify(body)).toContain('site inválido');
  });
});

describe('sem Desativar nas cinco tabelas (AO)', () => {
  it('mandar isActive é 422 em categoria, status, fabricante, modelo e localização', async () => {
    const fabricante = await criarFabricante(api, 'Fabricante sem desativar');
    const modelo = await criarModelo(api, { categoriaId, fabricanteId: fabricante, name: 'Modelo sem desativar' });
    const status = await api.post<{ id: string }>('/api/status-labels', { name: 'Status sem desativar', type: 'UNDEPLOYABLE' });
    const local = await api.post<{ id: string }>('/api/locations', { name: 'Local sem desativar' });

    const registros: [string, string][] = [
      ['categories', categoriaId], ['status-labels', status.body.id], ['manufacturers', fabricante],
      ['asset-models', modelo], ['locations', local.body.id],
    ];
    for (const [rota, id] of registros) {
      expect((await api.put(`/api/${rota}/${id}`, { isActive: false })).status, rota).toBe(422);
    }
  });

  it('o seletor não tem mais o "incluir desativados"', async () => {
    expect((await api.get('/api/manufacturers/options?inativos=incluir')).status).toBe(422);
  });

  it('a exclusão recusada diz o que tirar, sem sugerir desativar', async () => {
    const fabricante = await criarFabricante(api, 'Fabricante com modelo');
    await criarModelo(api, { categoriaId, fabricanteId: fabricante, name: 'Modelo que segura' });

    const { status, body } = await api.delete<{ error: string }>(`/api/manufacturers/${fabricante}`);
    expect(status).toBe(409);
    expect(body.error).toMatch(/Troque o fabricante desses registros e exclua de novo\./);
    expect(body.error).not.toMatch(/esativ/);
  });
});

describe('o último status de um tipo automático', () => {
  // Deixa um status novo como o ÚNICO do tipo. Os outros saem do tipo por fora
  // da API — pela API não sairiam, e é isso que se prova — e voltam no fim.
  async function sozinhoNoTipo(
    tipo: 'DEPLOYABLE' | 'IN_USE',
    nome: string,
    prova: (id: string) => Promise<void>,
  ): Promise<void> {
    const novo = await api.post<{ id: string }>('/api/status-labels', { name: nome, type: tipo });
    const outros = (await prisma.statusLabel.findMany({
      where: { type: tipo, id: { not: novo.body.id } }, select: { id: true },
    })).map((linha) => linha.id);
    await prisma.statusLabel.updateMany({ where: { id: { in: outros } }, data: { type: 'UNDEPLOYABLE' } });
    try {
      await prova(novo.body.id);
    } finally {
      await prisma.statusLabel.updateMany({ where: { id: { in: outros } }, data: { type: tipo } });
    }
  }

  it('não muda de tipo — a devolução o aplica sozinha', async () => {
    await sozinhoNoTipo('DEPLOYABLE', 'Prateleira sozinha', async (id) => {
      const { status, body } = await api.put<{ error: string }>(`/api/status-labels/${id}`, { type: 'UNDEPLOYABLE' });
      expect(status).toBe(409);
      expect(body.error).toMatch(/único status do tipo Disponível/);
    });
  });

  it('não se exclui, mesmo sem nenhum ativo usando', async () => {
    await sozinhoNoTipo('IN_USE', 'Em uso sozinho', async (id) => {
      const { status, body } = await api.delete<{ error: string }>(`/api/status-labels/${id}`);
      expect(status).toBe(409);
      expect(body.error).toMatch(/único status do tipo Em uso/);
    });
  });

  it('com outro do mesmo tipo, sai', async () => {
    const segundo = await api.post<{ id: string }>('/api/status-labels', { name: 'Prateleira dois', type: 'DEPLOYABLE' });
    expect((await api.put(`/api/status-labels/${segundo.body.id}`, { type: 'PENDING' })).status).toBe(200);
    expect((await api.delete(`/api/status-labels/${segundo.body.id}`)).status).toBe(200);
  });
});

describe('nome com % ou _ não é curinga', () => {
  it('"Z%" e "Z_ta Corp" não colidem com "Zeta Corp"', async () => {
    await criarFabricante(api, 'Zeta Corp');
    expect((await api.post('/api/manufacturers', { name: 'Z%' })).status).toBe(201);
    expect((await api.post('/api/manufacturers', { name: 'Z_ta Corp' })).status).toBe(201);
  });
});

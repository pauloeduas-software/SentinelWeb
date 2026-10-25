import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarFabricante, criarLicenca, criarModelo, idsDoSeed,
} from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

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

  it('e a licença ENCERRADA também segura: ela continua na aba Encerradas', async () => {
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

describe('desativar — nas quatro tabelas além de Localização', () => {
  async function desativar(rota: string, id: string) {
    const { status } = await api.put(`/api/${rota}/${id}`, { isActive: false });
    expect(status).toBe(200);
  }

  it('o desativado some das escolhas, mas o FILTRO ainda o acha', async () => {
    const id = await criarFabricante(api, 'Fabricante que saiu de linha');
    await desativar('manufacturers', id);

    const escolha = await api.get<{ id: string }[]>('/api/manufacturers/options');
    expect(escolha.body.map((o) => o.id)).not.toContain(id);

    const filtro = await api.get<{ id: string }[]>('/api/manufacturers/options?inativos=incluir');
    expect(filtro.body.map((o) => o.id)).toContain(id);
  });

  it('fabricante desativado não é escolhido para modelo NOVO — 409', async () => {
    const id = await criarFabricante(api, 'Fabricante desativado');
    await desativar('manufacturers', id);

    const { status, body } = await api.post<{ error: string }>('/api/asset-models', {
      name: 'Modelo novo', manufacturerId: id, categoryId: categoriaId,
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/desativado/);
  });

  it('o modelo que JÁ era dele continua editável, reenviando o mesmo fabricante', async () => {
    // O formulário reenvia todo campo: a guarda só vale quando o vínculo muda.
    const fabricante = await criarFabricante(api, 'Fabricante antigo');
    const modelo = await criarModelo(api, { categoriaId, fabricanteId: fabricante, name: 'Modelo antigo' });
    await desativar('manufacturers', fabricante);

    const { status } = await api.put(`/api/asset-models/${modelo}`, {
      name: 'Modelo antigo renomeado', manufacturerId: fabricante, categoryId: categoriaId,
    });
    expect(status).toBe(200);
  });

  it('modelo e status desativados não entram em ativo novo — 409', async () => {
    const seed = await idsDoSeed();
    const fabricante = await criarFabricante(api, 'Fabricante do modelo desativado');
    const modelo = await criarModelo(api, { categoriaId, fabricanteId: fabricante, name: 'Modelo desativado' });
    await desativar('asset-models', modelo);

    const comModelo = await api.post<{ error: string }>('/api/assets', { statusId: seed.statusDeployableId, modelId: modelo });
    expect(comModelo.status).toBe(409);

    const status = await api.post<{ id: string }>('/api/status-labels', { name: 'Status aposentado', type: 'DEPLOYABLE' });
    await desativar('status-labels', status.body.id);
    const comStatus = await api.post<{ error: string }>('/api/assets', { statusId: status.body.id, modelId });
    expect(comStatus.status).toBe(409);
    expect(comStatus.body.error).toMatch(/desativado/);
  });

  it('categoria desativada não é escolhida para licença nova — 409', async () => {
    const { body } = await api.post<{ id: string }>('/api/categories', { name: 'Família descontinuada', type: 'LICENSE' });
    await desativar('categories', body.id);

    const licenca = await api.post<{ error: string }>('/api/licenses', { name: 'Licença nova', seatsTotal: 1, categoryId: body.id });
    expect(licenca.status).toBe(409);
  });

  it('a exclusão recusada sugere desativar', async () => {
    const fabricante = await criarFabricante(api, 'Fabricante com modelo');
    await criarModelo(api, { categoriaId, fabricanteId: fabricante, name: 'Modelo que segura' });

    const { status, body } = await api.delete<{ error: string }>(`/api/manufacturers/${fabricante}`);
    expect(status).toBe(409);
    expect(body.error).toMatch(/Desative-o em vez de excluir/);
  });
});

describe('o último status ativo de um tipo automático', () => {
  it('não se desativa — a entrega e a devolução o aplicam sozinhas', async () => {
    // Deixa o "Disponível" do seed como o ÚNICO ativo do tipo: outros testes
    // deste arquivo criam status disponíveis, e eles saem primeiro — cada um
    // pode, porque o do seed continua.
    const { statusDeployableId } = await idsDoSeed();
    const ativos = await api.get<{ id: string }[]>('/api/status-labels/options?type=DEPLOYABLE');
    for (const { id } of ativos.body.filter((opcao) => opcao.id !== statusDeployableId)) {
      expect((await api.put(`/api/status-labels/${id}`, { isActive: false })).status).toBe(200);
    }

    const { status, body } = await api.put<{ error: string }>(`/api/status-labels/${statusDeployableId}`, { isActive: false });
    expect(status).toBe(409);
    expect(body.error).toMatch(/único status ativo/);

    // Com um segundo do mesmo tipo, o primeiro pode sair.
    const outro = await api.post('/api/status-labels', { name: 'Prateleira', type: 'DEPLOYABLE' });
    expect(outro.status).toBe(201);
    expect((await api.put(`/api/status-labels/${statusDeployableId}`, { isActive: false })).status).toBe(200);
  });
});

describe('o último status ativo — também na exclusão', () => {
  it('não se exclui o único "Em uso" ativo, mesmo sem nenhum ativo usando', async () => {
    // Deixa um IN_USE novo como o único ativo do tipo: os outros saem primeiro.
    const novo = await api.post<{ id: string }>('/api/status-labels', { name: 'Em uso — sozinho', type: 'IN_USE' });
    const ativos = await api.get<{ id: string }[]>('/api/status-labels/options?type=IN_USE');
    for (const { id } of ativos.body.filter((opcao) => opcao.id !== novo.body.id)) {
      expect((await api.put(`/api/status-labels/${id}`, { isActive: false })).status).toBe(200);
    }

    const { status, body } = await api.delete<{ error: string }>(`/api/status-labels/${novo.body.id}`);
    expect(status).toBe(409);
    expect(body.error).toMatch(/único status ativo/);
  });
});

describe('nome com % ou _ não é curinga', () => {
  it('"Z%" e "Z_ta Corp" não colidem com "Zeta Corp"', async () => {
    await criarFabricante(api, 'Zeta Corp');
    expect((await api.post('/api/manufacturers', { name: 'Z%' })).status).toBe(201);
    expect((await api.post('/api/manufacturers', { name: 'Z_ta Corp' })).status).toBe(201);
  });
});

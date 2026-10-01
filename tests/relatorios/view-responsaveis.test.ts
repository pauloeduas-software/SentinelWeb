import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo, criarLocal } from '../helpers/fixtures';

// A VIEW ≡ O RESOLVER (F10, Etapa F — D66 e D129).
//
// ═════════════════════════════════════════════════════════════════════════════
// ESTE É O TESTE QUE IMPEDE A CAMADA 3 DE TER DUAS DEFINIÇÕES.
//
// A responsabilidade resolvida passou a existir em dois lugares:
//
//   `resolverResponsaveisEmLote`  junção em memória, usada pela tela de ativos,
//                                 pelo detalhe, pela auditoria e pelo posto;
//   `vw_asset_responsibles`       SQL, usada pelos relatórios que AGRUPAM —
//                                 porque não dá para agrupar o que não foi
//                                 buscado (D66).
//
// Duas respostas para "quem responde por este ativo" é o D16, e foi exatamente
// isso que a auditoria da fase encontrou no SQL do plano: ele não filtrava a
// lixeira, emitia responsável NULO no salto de ativo e falava outra língua no
// `via`. Os três defeitos passariam por qualquer teste que olhasse só a view.
//
// A comparação é feita pelos DOIS CAMINHOS DE VERDADE, por HTTP: a listagem de
// ativos (que usa o resolver) contra o relatório montado (que usa a view).
// Nenhum use-case é chamado direto — é a regra do `tests/helpers/app.ts`.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

interface AtivoNaListagem {
  id: string;
  assetTag: string;
  posse: {
    responsaveis: { name: string; via: string }[];
    postoVago: boolean;
  } | null;
}

interface LinhaDoBuilder {
  assetTag: string;
  responsavel: string;
  via: string;
}

const SEM_RESPONSAVEL = '(sem responsável)';

/** `{ etiqueta → ['Nome|VIA', …] }` pelo caminho da TELA (o resolver). */
async function peloResolver(): Promise<Map<string, string[]>> {
  const { body } = await api.get<{ rows: AtivoNaListagem[] }>('/api/assets?perPage=100');
  const mapa = new Map<string, string[]>();

  for (const ativo of body.rows) {
    mapa.set(
      ativo.assetTag,
      (ativo.posse?.responsaveis ?? []).map((pessoa) => `${pessoa.name}|${pessoa.via}`).sort(),
    );
  }

  return mapa;
}

/** `{ etiqueta → ['Nome|VIA', …] }` pelo caminho do RELATÓRIO (a view). */
async function pelaView(): Promise<Map<string, string[]>> {
  const { body } = await api.post<{ linhas: LinhaDoBuilder[] }>('/api/reports/custom', {
    columns: ['assetTag', 'responsavel', 'via'],
    limit: 2000,
  });

  const mapa = new Map<string, string[]>();

  for (const linha of body.linhas) {
    const atual = mapa.get(linha.assetTag) ?? [];

    // A linha "(sem responsável)" é o `LEFT JOIN` sem par — o ativo existe no
    // relatório e não tem ninguém. O resolver expressa o mesmo com lista vazia.
    if (linha.responsavel !== SEM_RESPONSAVEL) atual.push(`${linha.responsavel}|${linha.via}`);

    mapa.set(linha.assetTag, atual.sort());
  }

  return mapa;
}

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api, ' (view)');
});

afterAll(async () => {
  await api.fechar();
});

describe('vw_asset_responsibles contra resolverResponsaveisEmLote', () => {
  it('DIRETO: a posse é da pessoa', async () => {
    await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });

    const [resolver, view] = await Promise.all([peloResolver(), pelaView()]);

    expect(view.get(cenario.ativo.assetTag)).toEqual(['Laura Souza (view)|DIRETO']);
    expect(view.get(cenario.ativo.assetTag)).toEqual(resolver.get(cenario.ativo.assetTag));
  });

  it('POSTO com DUAS pessoas: as duas respondem, nos dois caminhos', async () => {
    await api.post(`/api/locations/${cenario.mesa1}/occupants`, {
      userId: cenario.laura, shift: 'manhã',
    });
    await api.post(`/api/locations/${cenario.mesa1}/occupants`, {
      userId: cenario.ana, shift: 'tarde',
    });

    const naMesa = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId,
    });
    await api.post(`/api/assets/${naMesa.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: cenario.mesa1,
    });

    const [resolver, view] = await Promise.all([peloResolver(), pelaView()]);

    expect(view.get(naMesa.assetTag)).toEqual([
      'Ana Lima (view)|POSTO',
      'Laura Souza (view)|POSTO',
    ]);
    expect(view.get(naMesa.assetTag)).toEqual(resolver.get(naMesa.assetTag));
  });

  it('POSTO VAGO: nenhuma linha na view, lista vazia no resolver', async () => {
    const mesaVazia = await criarLocal(api, { name: 'Mesa Vazia (view)', isWorkstation: true });
    const parado = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId,
    });
    await api.post(`/api/assets/${parado.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: mesaVazia,
    });

    const [resolver, view] = await Promise.all([peloResolver(), pelaView()]);

    // É por isto que "posto vago" NÃO sai da view (D130): o `JOIN` com os
    // ocupantes elimina o posto sem ninguém, por construção.
    expect(view.get(parado.assetTag)).toEqual([]);
    expect(resolver.get(parado.assetTag)).toEqual([]);
    // E o sinal operacional continua vindo do resolver, que sabe dizer POR QUE
    // a lista está vazia.
    const { body } = await api.get<{ rows: AtivoNaListagem[] }>('/api/assets?perPage=100');
    const linha = body.rows.find((ativo) => ativo.assetTag === parado.assetTag);
    expect(linha?.posse?.postoVago).toBe(true);
  });

  it('SALTO DE ATIVO: a dock entregue à pessoa responde pelo notebook preso nela', async () => {
    const dock = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId,
    });
    const preso = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId,
    });

    await api.post(`/api/assets/${dock.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.ana,
    });
    await api.post(`/api/assets/${preso.id}/checkout`, {
      targetType: 'ASSET', targetAssetId: dock.id,
    });

    const [resolver, view] = await Promise.all([peloResolver(), pelaView()]);

    expect(view.get(preso.assetTag)).toEqual(['Ana Lima (view)|ATIVO']);
    expect(view.get(preso.assetTag)).toEqual(resolver.get(preso.assetTag));
  });

  it('SALTO PARA POSTO VAZIO: nenhum dos dois inventa um responsável NULO', async () => {
    // O defeito 2 da auditoria: o `COALESCE` do plano devolvia uma linha com
    // `userId` nulo quando a dock está num posto sem ocupante — e um
    // `GROUP BY` criaria um balde que a tela nunca teve.
    const mesaDeserta = await criarLocal(api, { name: 'Mesa Deserta (view)', isWorkstation: true });
    const dock = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId,
    });
    const preso = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId,
    });

    await api.post(`/api/assets/${dock.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: mesaDeserta,
    });
    await api.post(`/api/assets/${preso.id}/checkout`, {
      targetType: 'ASSET', targetAssetId: dock.id,
    });

    const [resolver, view] = await Promise.all([peloResolver(), pelaView()]);

    expect(view.get(preso.assetTag)).toEqual([]);
    expect(resolver.get(preso.assetTag)).toEqual([]);

    // E a prova direta na view: zero linhas com responsável nulo, em TODA ela.
    const [{ total }] = await prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM vw_asset_responsibles WHERE "userId" IS NULL
    `;
    expect(total).toBe(0);
  });

  it('ATIVO NA LIXEIRA sai da view — o relatório não conta o que a tela esconde', async () => {
    const naLixeira = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId,
    });
    await api.post(`/api/assets/${naLixeira.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });

    const antes = await prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM vw_asset_responsibles WHERE "assetId" = ${naLixeira.id}::uuid
    `;
    expect(antes[0].total).toBe(1);

    // A devolução é necessária: ativo com posse aberta não vai para a lixeira.
    await api.post(`/api/assets/${naLixeira.id}/checkin`, {});
    await api.post(`/api/assets/${naLixeira.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });
    await prisma.asset.update({ where: { id: naLixeira.id }, data: { deletedAt: new Date() } });

    const depois = await prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM vw_asset_responsibles WHERE "assetId" = ${naLixeira.id}::uuid
    `;

    // O defeito 1 da auditoria: `$queryRaw` NÃO passa pela extension de soft
    // delete, então sem o `deletedAt IS NULL` DENTRO da view o relatório
    // contaria este ativo.
    expect(depois[0].total).toBe(0);
  });
});

describe('GET /api/reports/responsabilidade', () => {
  it('separa direto, por posto e por ativo — e o total não conta o ativo duas vezes', async () => {
    const { status, body } = await api.get<{
      linhas: {
        name: string; diretos: number; porPosto: number; porAtivo: number; total: number;
        desligado: boolean; custoTotal: string | null;
      }[];
      semResponsavel: number;
      desligadosComPosse: number;
    }>('/api/reports/responsabilidade');

    expect(status).toBe(200);

    const laura = body.linhas.find((linha) => linha.name === 'Laura Souza (view)');
    expect(laura).toBeDefined();
    // Um direto (o ativo do cenário) e um por posto (o da Mesa 1).
    expect(laura!.diretos).toBe(1);
    expect(laura!.porPosto).toBe(1);
    expect(laura!.total).toBe(laura!.diretos + laura!.porPosto + laura!.porAtivo);

    const ana = body.linhas.find((linha) => linha.name === 'Ana Lima (view)');
    // A Ana responde pela dock (direto), pelo notebook preso nela (por ativo) e
    // pelo ativo da Mesa 1 (por posto).
    expect(ana!.porAtivo).toBeGreaterThanOrEqual(1);

    // Os ativos parados em posto vago não têm responsável — e o relatório os
    // conta à parte, que é a outra pergunta.
    expect(body.semResponsavel).toBeGreaterThanOrEqual(2);
  });

  it('exige sessão', async () => {
    const { status } = await api.anonimo.get('/api/reports/responsabilidade');
    expect(status).toBe(401);
  });
});

describe('POST /api/reports/custom — o builder (D67)', () => {
  it('recusa token fora da allowlist, devolvendo a lista dos válidos', async () => {
    const { status, body } = await api.post<{ error: string; validas?: string[] }>(
      '/api/reports/custom',
      { columns: ['assetTag', 'a."purchaseCost"; DROP TABLE assets'] },
    );

    expect(status).toBe(422);
    expect(body.error).toMatch(/Coluna desconhecida/);
    expect(body.validas).toContain('responsavel');
  });

  it('agrupa por responsável resolvido — o que nenhuma coluna de tabela responde', async () => {
    const { status, body } = await api.post<{
      agruparPor: string;
      grupos: { grupo: string; ativos: number; custoTotal: string | null }[];
    }>('/api/reports/custom', { columns: ['assetTag'], agruparPor: 'responsavel' });

    expect(status).toBe(200);
    expect(body.agruparPor).toBe('responsavel');

    const laura = body.grupos.find((grupo) => grupo.grupo === 'Laura Souza (view)');
    expect(laura!.ativos).toBe(2);

    // O balde dos sem responsável tem rótulo, não `null`: é o grupo que alguém
    // abre o relatório para ver.
    expect(body.grupos.some((grupo) => grupo.grupo === '(sem responsável)')).toBe(true);
  });

  it('recusa agrupar por coluna que é VALOR, não categoria', async () => {
    const { status, body } = await api.post<{ error: string; agrupaveis?: string[] }>(
      '/api/reports/custom',
      { columns: ['assetTag'], agruparPor: 'purchaseCost' },
    );

    expect(status).toBe(422);
    expect(body.error).toMatch(/não pode agrupar/);
    expect(body.agrupaveis).toContain('status');
  });

  it('recusa corpo vazio e mais de 15 colunas', async () => {
    const vazio = await api.post('/api/reports/custom', { columns: [] });
    const demais = await api.post('/api/reports/custom', {
      columns: Array.from({ length: 16 }, () => 'assetTag'),
    });

    expect([vazio.status, demais.status]).toEqual([422, 422]);
  });

  it('o seletor da tela sai do servidor, com o que pode agrupar', async () => {
    const { body } = await api.get<{ colunas: string[]; agrupaveis: string[] }>(
      '/api/reports/builder/fields',
    );

    expect(body.colunas).toContain('turno');
    expect(body.agrupaveis).toContain('posto');
    expect(body.agrupaveis).not.toContain('purchaseCost');
  });
});

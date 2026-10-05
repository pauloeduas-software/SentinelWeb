import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarLocal } from '../helpers/fixtures';

// O AGRUPAMENTO DO BUILDER (F10, Etapa F) — e a soma que contava o mesmo
// equipamento duas vezes.
//
// ═════════════════════════════════════════════════════════════════════════════
// O `LEFT JOIN` COM A VIEW MULTIPLICA LINHAS, E ISSO É CORRETO.
//
// Um ativo entregue a um posto com DUAS pessoas aparece DUAS vezes em
// `vw_asset_responsibles` — uma por responsável. É o que o modelo de posse
// promete e é o que torna "o que cada pessoa responde" respondível
// (docs/referencia/modelo-de-posse.md, Camada 3).
//
// O QUE NÃO ERA CORRETO: o `COUNT(DISTINCT a.id)` do agrupamento sabia disso e o
// `SUM(a."purchaseCost")` ao lado NÃO. A contagem saía certa e o dinheiro saía
// DOBRADO — num relatório cuja única razão de ser é somar custo por categoria,
// por fornecedor ou por pessoa.
//
// É o defeito que falha em silêncio: a planilha fecha com um número plausível,
// maior que o parque, e o erro CRESCE com o uso do modelo de posse — quanto mais
// mesa compartilhada, mais inflado. Ninguém confere a soma de um relatório
// contra o banco; confere-se contra a nota fiscal, meses depois.
//
// A deduplicação certa é por (ativo, grupo) — a mesma granularidade que o
// `COUNT(DISTINCT a.id)` já tinha. `SUM(DISTINCT …)` seria pior: descartaria
// dois ativos de MESMO preço.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

/** Uma sala só deste arquivo: é por ela que se agrupa, para o seed não entrar na conta. */
let sala = '';

interface GrupoNaResposta {
  grupo: string | null;
  ativos: number;
  custoTotal: string | null;
}

const SALA = 'Sala da Soma (builder)';
const CUSTO_COMPARTILHADO = '1000.00';
const CUSTO_SOZINHO = '250.50';

/** Cria um ativo com custo e localização — `criarAtivo` não leva custo. */
async function criarAtivoComCusto(custo: string): Promise<{ id: string; assetTag: string }> {
  const { status, body } = await api.post<{ id: string; assetTag: string }>('/api/assets', {
    statusId: cenario.statusDeployableId,
    modelId: cenario.modelId,
    locationId: sala,
    purchaseCost: custo,
  });

  expect(status).toBe(201);
  return body;
}

async function agruparPor(token: string): Promise<GrupoNaResposta[]> {
  const { status, body } = await api.post<{ grupos: GrupoNaResposta[] }>('/api/reports/custom', {
    columns: ['assetTag', 'purchaseCost'],
    agruparPor: token,
  });

  expect(status).toBe(200);
  return body.grupos;
}

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api, ' (builder)');
  sala = await criarLocal(api, { name: SALA });

  // O POSTO COM DUAS PESSOAS — a situação que multiplica as linhas da view.
  await api.post(`/api/locations/${cenario.mesa1}/occupants`, {
    userId: cenario.laura, shift: 'manhã',
  });
  await api.post(`/api/locations/${cenario.mesa1}/occupants`, {
    userId: cenario.ana, shift: 'tarde',
  });

  const compartilhado = await criarAtivoComCusto(CUSTO_COMPARTILHADO);
  await api.post(`/api/assets/${compartilhado.id}/checkout`, {
    targetType: 'LOCATION', targetLocationId: cenario.mesa1,
  });

  // E um ativo na MESMA sala, sem responsável nenhum: ele é o que prova que a
  // soma continua somando, e não só deduplicando.
  await criarAtivoComCusto(CUSTO_SOZINHO);
});

afterAll(async () => {
  await api.fechar();
});

describe('POST /api/reports/custom — a soma não conta o ativo duas vezes', () => {
  it('ativo de posto COMPARTILHADO entra UMA vez na contagem e UMA na soma', async () => {
    const grupo = (await agruparPor('location')).find((linha) => linha.grupo === SALA);

    expect(grupo).toBeDefined();
    // Dois ativos na sala: o compartilhado (duas linhas na view) e o sozinho.
    expect(grupo?.ativos).toBe(2);
    // 1000.00 + 250.50. Antes da correção, o compartilhado entrava duas vezes e
    // o total saía 2250.50.
    expect(Number(grupo?.custoTotal)).toBeCloseTo(1250.5, 2);
  });

  it('agrupando por RESPONSÁVEL, cada pessoa carrega o custo INTEIRO do que responde', async () => {
    // Aqui a duplicação é a resposta certa: as duas respondem pelo MESMO
    // equipamento, solidariamente, e cada linha do relatório é de uma delas. O
    // que não pode é a mesma pessoa somar o mesmo ativo duas vezes.
    const grupos = await agruparPor('responsavel');

    for (const nome of ['Laura Souza (builder)', 'Ana Lima (builder)']) {
      const dela = grupos.find((linha) => linha.grupo === nome);

      expect(dela, `grupo de ${nome}`).toBeDefined();
      expect(dela?.ativos).toBe(1);
      expect(Number(dela?.custoTotal)).toBeCloseTo(1000, 2);
    }
  });

  it('o balde "(sem responsável)" existe e o ativo sem posse está nele', async () => {
    const semNinguem = (await agruparPor('responsavel'))
      .find((linha) => linha.grupo === '(sem responsável)');

    expect(semNinguem).toBeDefined();
    // O `COALESCE` com a frase existe para isto: um `NULL` viraria um balde sem
    // rótulo na tela, e é justamente o grupo que alguém abre o relatório para ver.
    expect(semNinguem!.ativos).toBeGreaterThanOrEqual(1);
  });

  it('a ordem dos grupos é estável: contagem, e o grupo como desempate', async () => {
    const [primeira, segunda] = await Promise.all([agruparPor('status'), agruparPor('status')]);

    expect(primeira.map((linha) => linha.grupo)).toEqual(segunda.map((linha) => linha.grupo));
  });

  it('token fora do mapa é 422 COM A LISTA dos válidos (D67)', async () => {
    const { status, body } = await api.post<{ validas?: string[] }>('/api/reports/custom', {
      columns: ['assetTag'],
      agruparPor: 'a."purchaseCost"; DROP TABLE assets',
    });

    expect(status).toBe(422);
    expect(body.validas ?? []).toContain('assetTag');
  });
});

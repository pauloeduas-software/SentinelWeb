import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// DADO SENSÍVEL É OMITIDO DO `select`, NÃO MASCARADO DEPOIS (F11, D77).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE AS ASSERÇÕES USAM `in` / `hasOwnProperty` E NÃO `=== null`.
//
// A diferença entre "o campo veio nulo" e "o campo não veio" é o D77 inteiro.
// Nulo significa que o valor foi LIDO do banco e chegou até a serialização — e
// aí ele já passou por qualquer log, qualquer `JSON.stringify` de handler de
// erro e qualquer `changes` de AuditLog montado com spread no caminho.
// Ausente significa que ele nunca foi lido.
//
// Um teste que aceitasse `purchaseCost === null` passaria com a implementação
// errada (ler e apagar antes de responder), que é exatamente a que o D77
// descartou.
//
// COM UM CARGO SÓ (Z), os casos aqui são os que se provam com o ADMIN: a busca
// e as escritas, que não trazem o custo para cargo nenhum, e o ADMIN vendo o
// custo onde ele aparece. Não há sessão abaixo de ADMIN para provar o outro
// lado.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let assetId: string;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante do Custo');
  const modelId = await criarModelo(api, {
    name: 'Modelo do Custo', fabricanteId, categoriaId: seed.categoriaId,
  });

  // `purchaseCost` e `purchaseDate` entram na CRIAÇÃO, pelo caminho do
  // formulário: é o custo deste ativo que todas as asserções perseguem.
  const ativo = await api.post<{ id: string }>('/api/assets', {
    assetTag: 'ATV-CUSTO-1',
    modelId,
    statusId: seed.statusDeployableId,
    purchaseCost: '4250.90',
    purchaseDate: '2025-03-10',
  });
  expect(ativo.status).toBe(201);
  assetId = ativo.body.id;
});

afterAll(async () => { await api.fechar(); });

describe('custo de compra — `ADMIN` (D148), hoje o único cargo (Z)', () => {
  it('quem É ADMIN continua vendo o custo', async () => {
    // A metade do teste de permissão que sobra com um cargo só: provar que o
    // cargo ABRE é o que impede uma implementação que esconde de todos.
    const resposta = await api.get<Record<string, unknown>>(`/api/assets/${assetId}`);

    expect(resposta.body.purchaseCost).toBe('4250.9');
  });

  it('o ADMIN vê o custo dos ativos da mesa na ficha do posto', async () => {
    // A mesa vem pelo Prisma porque o que está sob teste é a LEITURA do posto, e
    // não o cadastro dele.
    const mesa = await prisma.workstation.create({
      data: { name: 'Mesa do Custo', location: { create: { name: 'Local da Mesa do Custo' } } },
      select: { id: true },
    });
    expect((await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'WORKSTATION',
      targetWorkstationId: mesa.id,
    })).status).toBe(201);

    const resposta = await api.get<{ ativos: Record<string, unknown>[] }>(`/api/workstations/${mesa.id}`);
    const linha = resposta.body.ativos.find((a) => a.assetTag === 'ATV-CUSTO-1');
    expect(linha!.purchaseCost).toBe('4250.9');
  });

  it('a BUSCA GLOBAL não traz a propriedade — no acerto exato nem no aproximado', async () => {
    // A QUARTA PORTA. `GET /api/search` devolvia o ativo inteiro com o select
    // da listagem. Hoje a busca devolve só o que identifica o ativo, para todo
    // cargo. Os dois caminhos são consultas diferentes, então os dois
    // são conferidos — um `select` esquecido no aproximado passaria pelo caso
    // do exato.
    type Busca = { tipo: string; ativos: Record<string, unknown>[] };

    const exato = await api.get<Busca>('/api/search?q=ATV-CUSTO-1');
    expect(exato.status).toBe(200);
    expect(exato.body.tipo).toBe('EXATO');
    expect(Object.hasOwn(exato.body.ativos[0], 'purchaseCost')).toBe(false);

    const aproximado = await api.get<Busca>('/api/search?q=CUSTO');
    expect(aproximado.body.tipo).toBe('PARCIAL');
    const linha = aproximado.body.ativos.find((a) => a.assetTag === 'ATV-CUSTO-1');
    expect(linha).toBeDefined();
    expect(Object.hasOwn(linha!, 'purchaseCost')).toBe(false);
  });

  it('as respostas de ESCRITA não trazem o custo, para cargo nenhum', async () => {
    // A QUINTA PORTA: criar, editar, entregar, devolver, dar baixa e restaurar
    // respondem com o ativo atualizado (`ASSET_WRITE_SELECT`).
    const resposta = await api.put<Record<string, unknown>>(`/api/assets/${assetId}`, { notes: 'do admin' });
    expect(resposta.status).toBe(200);
    expect(Object.hasOwn(resposta.body, 'purchaseCost')).toBe(false);
  });
});

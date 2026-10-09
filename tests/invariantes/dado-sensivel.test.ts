import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste, type Cliente } from '../helpers/app';
import { criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// DADO SENSÍVEL É OMITIDO DO `select`, NÃO MASCARADO DEPOIS (F11, D77).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE AS ASSERÇÕES USAM `in` / `hasOwnProperty` E NÃO `=== null`.
//
// A diferença entre "o campo veio nulo" e "o campo não veio" é o D77 inteiro.
// Nulo significa que o valor foi LIDO do banco e chegou até a serialização — e
// aí ele já passou por qualquer log, qualquer `JSON.stringify` de handler de
// erro e qualquer `changes` de ActivityLog montado com spread no caminho.
// Ausente significa que ele nunca foi lido.
//
// Um teste que aceitasse `purchaseCost === null` passaria com a implementação
// errada (ler e apagar antes de responder), que é exatamente a que o D77
// descartou.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
/** Vê ativo, mas NÃO vê dinheiro. */
let semSegredo: Cliente;
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

  // `TECNICO` vê ativo, e NÃO vê custo, que o D148 pôs em `ADMIN`.
  semSegredo = await api.comoUsuario('TECNICO');
});

afterAll(async () => { await api.fechar(); });

describe('custo de compra — só `ADMIN` (D148)', () => {
  it('a LISTAGEM não traz a propriedade para quem não tem a chave', async () => {
    const resposta = await semSegredo.get<{ rows: Record<string, unknown>[] }>('/api/assets');

    expect(resposta.status).toBe(200);
    const linha = resposta.body.rows.find((r) => r.assetTag === 'ATV-CUSTO-1');
    expect(linha).toBeDefined();
    // AUSENTE, não nula.
    expect(Object.hasOwn(linha!, 'purchaseCost')).toBe(false);
  });

  it('o DETALHE não traz a propriedade — nem a regra de depreciação', async () => {
    const resposta = await semSegredo.get<Record<string, unknown>>(`/api/assets/${assetId}`);

    expect(resposta.status).toBe(200);
    expect(Object.hasOwn(resposta.body, 'purchaseCost')).toBe(false);

    // A regra de depreciação e o valor contábil saíram com o D152 — o que este
    // caso prova hoje é só a coluna: ela não vem no select de quem não é ADMIN.
  });

  it('quem É ADMIN continua vendo o custo', async () => {
    // A metade esquecida do teste de permissão: provar que o papel ABRE é o que
    // impede uma implementação que esconde de todos e passa no caso de cima.
    const resposta = await api.get<Record<string, unknown>>(`/api/assets/${assetId}`);

    expect(resposta.body.purchaseCost).toBe('4250.9');
  });

});


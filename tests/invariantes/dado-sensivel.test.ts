import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
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

  it('a FICHA DO POSTO não traz a propriedade dos ativos da mesa', async () => {
    // A TERCEIRA PORTA, e ela faltava. `GET /api/workstations/:id` devolve os
    // ativos entregues ao posto com o select de ativo, e `purchaseCost` está
    // nele: um técnico que abrisse a mesa recebia o custo de compra de cada
    // equipamento dela — pelo caminho que as duas asserções acima fecham em
    // `/api/assets`.
    //
    // A mesa vem pelo Prisma porque o que está sob teste é a LEITURA do posto, e
    // não o cadastro de localização.
    const mesa = await prisma.location.create({
      data: { name: 'Mesa do Custo', isWorkstation: true },
      select: { id: true },
    });
    expect((await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'LOCATION',
      targetLocationId: mesa.id,
    })).status).toBe(201);

    const resposta = await semSegredo.get<{ ativos: Record<string, unknown>[] }>(
      `/api/workstations/${mesa.id}`,
    );

    expect(resposta.status).toBe(200);
    const linha = resposta.body.ativos.find((a) => a.assetTag === 'ATV-CUSTO-1');
    expect(linha).toBeDefined();
    // AUSENTE, não nula.
    expect(Object.hasOwn(linha!, 'purchaseCost')).toBe(false);

    // E o ADMIN continua vendo: sem esta metade, esconder de todos passaria.
    const comoAdmin = await api.get<{ ativos: Record<string, unknown>[] }>(
      `/api/workstations/${mesa.id}`,
    );
    const linhaDoAdmin = comoAdmin.body.ativos.find((a) => a.assetTag === 'ATV-CUSTO-1');
    expect(linhaDoAdmin!.purchaseCost).toBe('4250.9');
  });

  it('o DETALHE não traz a propriedade — nem a regra de depreciação', async () => {
    const resposta = await semSegredo.get<Record<string, unknown>>(`/api/assets/${assetId}`);

    expect(resposta.status).toBe(200);
    expect(Object.hasOwn(resposta.body, 'purchaseCost')).toBe(false);

    // A regra de depreciação e o valor contábil saíram com o D152 — o que este
    // caso prova hoje é só a coluna: ela não vem no select de quem não é ADMIN.
  });

  it('quem É ADMIN continua vendo o custo', async () => {
    // A metade esquecida do teste de permissão: provar que o cargo ABRE é o que
    // impede uma implementação que esconde de todos e passa no caso de cima.
    const resposta = await api.get<Record<string, unknown>>(`/api/assets/${assetId}`);

    expect(resposta.body.purchaseCost).toBe('4250.9');
  });

  it('a BUSCA GLOBAL não traz a propriedade — no acerto exato nem no aproximado', async () => {
    // A QUARTA PORTA. `GET /api/search` devolvia o ativo inteiro com o select
    // da listagem: um técnico que bipasse a etiqueta recebia o custo que a
    // listagem lhe esconde. Hoje a busca devolve só o que identifica o ativo,
    // para todo cargo. Os dois caminhos são consultas diferentes, então os dois
    // são conferidos — um `select` esquecido no aproximado passaria pelo caso
    // do exato.
    type Busca = { tipo: string; ativos: Record<string, unknown>[] };

    const exato = await semSegredo.get<Busca>('/api/search?q=ATV-CUSTO-1');
    expect(exato.status).toBe(200);
    expect(exato.body.tipo).toBe('EXATO');
    expect(Object.hasOwn(exato.body.ativos[0], 'purchaseCost')).toBe(false);

    const aproximado = await semSegredo.get<Busca>('/api/search?q=CUSTO');
    expect(aproximado.body.tipo).toBe('PARCIAL');
    const linha = aproximado.body.ativos.find((a) => a.assetTag === 'ATV-CUSTO-1');
    expect(linha).toBeDefined();
    expect(Object.hasOwn(linha!, 'purchaseCost')).toBe(false);
  });

  it('as respostas de ESCRITA não trazem o custo, para cargo nenhum', async () => {
    // A QUINTA PORTA: criar, editar, entregar, devolver, dar baixa e restaurar
    // respondem com o ativo atualizado, e o técnico chama todas elas. A edição
    // é a que mais importa, porque é a que ele usa todo dia.
    const doTecnico = await semSegredo.put<Record<string, unknown>>(`/api/assets/${assetId}`, { notes: 'do técnico' });
    expect(doTecnico.status).toBe(200);
    expect(Object.hasOwn(doTecnico.body, 'purchaseCost')).toBe(false);

    const doAdmin = await api.put<Record<string, unknown>>(`/api/assets/${assetId}`, { notes: 'do admin' });
    expect(doAdmin.status).toBe(200);
    expect(Object.hasOwn(doAdmin.body, 'purchaseCost')).toBe(false);
  });

  it('o técnico edita sem apagar o custo que não vê', async () => {
    // O formulário antigo mandava `purchaseCost: ''` — o campo abria vazio para
    // quem não recebe o valor —, e o servidor gravava `null` por cima. Agora o
    // custo que chega de quem não é ADMIN é descartado.
    const resposta = await semSegredo.put(`/api/assets/${assetId}`, { name: 'Renomeado pelo técnico', purchaseCost: '' });
    expect(resposta.status).toBe(200);

    const gravado = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: { purchaseCost: true } });
    expect(gravado.purchaseCost?.toString()).toBe('4250.9');
  });

  it('o HISTÓRICO não mostra a mudança de custo a quem não é ADMIN', async () => {
    expect((await api.put(`/api/assets/${assetId}`, { purchaseCost: '5000.00' })).status).toBe(200);

    type Historico = { total: number; rows: { action: string; changes: Record<string, unknown> | null }[] };
    const mexeuNoCusto = (linhas: Historico['rows']) =>
      linhas.some((linha) => linha.changes !== null && Object.hasOwn(linha.changes, 'purchaseCost'));

    const doAdmin = await api.get<Historico>(`/api/assets/${assetId}/history`);
    expect(mexeuNoCusto(doAdmin.body.rows)).toBe(true);

    const doTecnico = await semSegredo.get<Historico>(`/api/assets/${assetId}/history`);
    expect(doTecnico.status).toBe(200);
    expect(mexeuNoCusto(doTecnico.body.rows)).toBe(false);
    // E o total não entrega que havia um evento a mais.
    expect(doTecnico.body.total).toBe(doTecnico.body.rows.length);
    expect(doAdmin.body.total).toBe(doTecnico.body.total + 1);
  });
});


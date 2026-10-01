import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// O BIPE (F10, Etapa G) — a busca do leitor de código de barras.
//
// A ORDEM DAS TENTATIVAS É O QUE ESTE ARQUIVO PROVA, e ela sai dos índices:
// etiqueta exata e série exata usam índice único parcial; o `ILIKE '%x%'` não
// usa índice nenhum e varre a tabela. Numa frota de 50 mil ativos, inverter a
// ordem transforma um bipe instantâneo numa varredura completa.
//
// E O QR LEVA URL (D70): o leitor de mão em modo "teclado" digita a URL INTEIRA
// no campo. Sem descartar o prefixo, bipar o QR dentro do campo não acharia
// nada — e a pessoa concluiria que a etiqueta está errada.

let api: ApiDeTeste;
let ativo: { id: string; assetTag: string };
let outroId = '';

interface Resultado {
  tipo: 'EXATO' | 'PARCIAL' | 'NENHUM';
  por: string;
  total: number;
  ativos: { id: string; assetTag: string; serial: string | null }[];
}

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Dell do Leitor');
  const modelId = await criarModelo(api, {
    categoriaId: seed.categoriaId, fabricanteId, name: 'Latitude do Leitor',
  });

  ativo = await criarAtivo(api, {
    statusId: seed.statusDeployableId,
    modelId,
    assetTag: 'ATV-BIPE-001',
    serial: 'SN-BIPE-0001',
    name: 'Notebook do bipe',
  });

  const outro = await criarAtivo(api, {
    statusId: seed.statusDeployableId, modelId, assetTag: 'ATV-BIPE-002', serial: 'SN-BIPE-0002',
  });
  outroId = outro.id;
});

afterAll(async () => {
  await api.fechar();
});

const buscar = (q: string) => api.get<Resultado>(`/api/search?q=${encodeURIComponent(q)}`);

describe('GET /api/search', () => {
  it('a ETIQUETA exata acha em um acerto, e diz que foi exato', async () => {
    const { status, body } = await buscar('ATV-BIPE-001');

    expect(status).toBe(200);
    expect(body.tipo).toBe('EXATO');
    expect(body.por).toBe('assetTag');
    expect(body.total).toBe(1);
    expect(body.ativos[0].id).toBe(ativo.id);
  });

  it('a SÉRIE exata vem depois da etiqueta, e também é exata', async () => {
    const { body } = await buscar('SN-BIPE-0001');

    expect(body.tipo).toBe('EXATO');
    expect(body.por).toBe('serial');
    expect(body.ativos[0].id).toBe(ativo.id);
  });

  it('o QR inteiro acha o ativo — o prefixo da URL é descartado', async () => {
    const { body } = await buscar(`http://localhost:3000/ativos/${ativo.id}`);

    expect(body.tipo).toBe('EXATO');
    expect(body.por).toBe('qr');
    expect(body.ativos[0].id).toBe(ativo.id);
  });

  it('o caminho ANTIGO do QR continua achando: etiqueta impressa dura anos', async () => {
    const { body } = await buscar(`/itam/assets/${outroId}`);

    expect(body.tipo).toBe('EXATO');
    expect(body.por).toBe('qr');
    expect(body.ativos[0].id).toBe(outroId);
  });

  it('só o que NÃO casou exato cai no aproximado', async () => {
    const { body } = await buscar('BIPE');

    expect(body.tipo).toBe('PARCIAL');
    expect(body.por).toBe('aproximado');
    expect(body.total).toBe(2);
  });

  it('o aproximado também acha pelo MODELO — é a mesma busca da listagem', async () => {
    const { body } = await buscar('Latitude do Leitor');

    expect(body.tipo).toBe('PARCIAL');
    expect(body.total).toBe(2);
  });

  it('nada encontrado é `NENHUM`, não erro', async () => {
    const { status, body } = await buscar('nao-existe-nada-assim');

    expect(status).toBe(200);
    expect(body.tipo).toBe('NENHUM');
    expect(body.ativos).toEqual([]);
  });

  it('NÃO come o zero à esquerda da etiqueta', async () => {
    // O leitor manda exatamente o que está impresso, e `ATV-BIPE-001` sem o
    // zero é outra etiqueta. Um `trim` esperto que normalizasse número faria o
    // bipe achar o ativo errado.
    const { body } = await buscar('ATV-BIPE-1');
    expect(body.tipo).not.toBe('EXATO');
  });

  it('o espaço em volta é ignorado — o leitor costuma mandar um \\r no fim', async () => {
    const { body } = await buscar('  ATV-BIPE-001  ');

    expect(body.tipo).toBe('EXATO');
    expect(body.por).toBe('assetTag');
  });

  it('recusa busca vazia com 422', async () => {
    const { status } = await api.get('/api/search?q=');
    expect(status).toBe(422);
  });

  it('exige sessão', async () => {
    const { status } = await api.anonimo.get('/api/search?q=ATV-BIPE-001');
    expect(status).toBe(401);
  });
});

describe('As etiquetas em PDF', () => {
  const LAYOUT = {
    pageSize: 'A4',
    cols: 3,
    rows: 8,
    marginTopMm: 12,
    marginLeftMm: 7,
    gutterXMm: 2.5,
    gutterYMm: 0,
    fields: ['assetTag', 'model', 'company'],
    qr: true,
    barcode: true,
  };

  it('o layout salvo vem com a medida calculada da etiqueta', async () => {
    const { status, body } = await api.get<{
      layout: { cols: number; fields: string[] };
      campos: { token: string; rotulo: string }[];
      medida: { larguraMm: number; alturaMm: number; porPagina: number };
    }>('/api/labels/layout');

    expect(status).toBe(200);
    expect(body.layout.cols).toBe(3);
    expect(body.medida.porPagina).toBe(24);
    // A medida é o número que se compara com a embalagem da folha adesiva.
    expect(body.medida.larguraMm).toBeGreaterThan(60);
    expect(body.campos.some((campo) => campo.token === 'assetTag')).toBe(true);
  });

  it('o PREVIEW é um PDF de verdade, `inline` e de UMA página', async () => {
    const resposta = await api.app.inject({
      method: 'POST',
      url: '/api/labels/preview',
      headers: { cookie: api.cookie },
      payload: { assetIds: [ativo.id, outroId], layout: LAYOUT },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toBe('application/pdf');
    expect(String(resposta.headers['content-disposition'])).toContain('inline');
    // `%PDF` é a assinatura do arquivo: o preview não é HTML desenhado para
    // parecer um PDF — ele É o arquivo que a impressão produz.
    expect(resposta.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('a FOLHA é o mesmo PDF, `attachment`', async () => {
    const resposta = await api.app.inject({
      method: 'POST',
      url: '/api/labels/sheet',
      headers: { cookie: api.cookie },
      payload: { assetIds: [ativo.id], layout: LAYOUT },
    });

    expect(resposta.statusCode).toBe(200);
    expect(String(resposta.headers['content-disposition'])).toContain('attachment');
    expect(resposta.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('recusa a grade dizendo QUAL elemento não cabe — e a correção é diferente', async () => {
    // 10 colunas numa A4 dão 17,4 mm de largura: cabe TEXTO e não cabe
    // Code128. A primeira versão do piso era um 15×8 mm único e deixava isto
    // passar, produzindo um PDF "válido" com código de barras ilegível — e a
    // folha perdida.
    const estreita = await api.app.inject({
      method: 'POST', url: '/api/labels/preview', headers: { cookie: api.cookie },
      payload: { assetIds: [ativo.id], layout: { ...LAYOUT, cols: 10, rows: 30 } },
    });

    expect(estreita.statusCode).toBe(422);
    expect(JSON.parse(estreita.body).error).toMatch(/código de barras precisa de pelo menos 30 mm/);
    expect(JSON.parse(estreita.body).error).toMatch(/reduza as COLUNAS/);

    // Sem o código de barras, a MESMA grade falha no QR — que é limitado pela
    // altura, então a correção é outra: menos linhas.
    const baixa = await api.app.inject({
      method: 'POST', url: '/api/labels/preview', headers: { cookie: api.cookie },
      payload: { assetIds: [ativo.id], layout: { ...LAYOUT, cols: 3, rows: 30, barcode: false } },
    });

    expect(baixa.statusCode).toBe(422);
    expect(JSON.parse(baixa.body).error).toMatch(/QR/);
    expect(JSON.parse(baixa.body).error).toMatch(/reduza as LINHAS/);

    // E sem nenhum dos dois, a mesma grade PASSA: só texto cabe em 9 mm.
    const soTexto = await api.app.inject({
      method: 'POST', url: '/api/labels/preview', headers: { cookie: api.cookie },
      payload: {
        assetIds: [ativo.id],
        layout: { ...LAYOUT, cols: 3, rows: 30, barcode: false, qr: false },
      },
    });

    expect(soTexto.statusCode).toBe(200);
  });

  it('recusa campo de etiqueta fora da allowlist', async () => {
    const resposta = await api.app.inject({
      method: 'POST',
      url: '/api/labels/preview',
      headers: { cookie: api.cookie },
      payload: { assetIds: [ativo.id], layout: { ...LAYOUT, fields: ['purchaseCost'] } },
    });

    // Custo de compra colado no equipamento é informação que qualquer visitante
    // lê — ele não está na allowlist, e isso não é esquecimento.
    expect(resposta.statusCode).toBe(422);
  });

  it('salva o layout e o devolve com a medida nova', async () => {
    const { status, body } = await api.put<{
      layout: { cols: number }; medida: { porPagina: number };
    }>('/api/labels/layout', { ...LAYOUT, cols: 2, rows: 5 });

    expect(status).toBe(200);
    expect(body.layout.cols).toBe(2);
    expect(body.medida.porPagina).toBe(10);

    // Volta ao padrão para não contaminar os outros arquivos da suíte.
    await api.put('/api/labels/layout', LAYOUT);
  });

  it('recusa folha sem ativo e com ativo que não existe', async () => {
    const vazia = await api.app.inject({
      method: 'POST', url: '/api/labels/sheet', headers: { cookie: api.cookie },
      payload: { assetIds: [], layout: LAYOUT },
    });
    const inexistente = await api.app.inject({
      method: 'POST', url: '/api/labels/sheet', headers: { cookie: api.cookie },
      payload: { assetIds: ['00000000-0000-4000-8000-000000000000'], layout: LAYOUT },
    });

    expect(vazia.statusCode).toBe(422);
    expect(inexistente.statusCode).toBe(404);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste, type Cliente } from '../helpers/app';
import { criarFabricante, criarLicenca, criarModelo, idsDoSeed } from '../helpers/fixtures';

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
/** Vê ativo e licença, mas NÃO vê dinheiro nem chave. */
let semSegredo: Cliente;
let assetId: string;
let licenseId: string;

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

  const licenca = await criarLicenca(api, {
    name: 'Office com chave',
    seatsTotal: 5,
    categoryId: seed.categoriaLicencaId,
    productKey: 'AAAAA-BBBBB-CCCCC-DDDDD',
  });
  licenseId = licenca.id;

  semSegredo = await api.comoUsuario([
    'assets.view', 'licenses.view', 'reports.view', 'reports.export',
  ]);
});

afterAll(async () => { await api.fechar(); });

describe('custo de compra — `assets.viewCost`', () => {
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

    // A REGRA FINANCEIRA TAMBÉM NÃO SAI: "48 meses, piso de R$ 300" é política
    // de depreciação, e sem o custo ela não serve para calcular nada — só
    // revelaria como a empresa deprecia.
    const modelo = resposta.body.model as Record<string, unknown>;
    expect(Object.hasOwn(modelo, 'depreciation')).toBe(false);

    // E O VALOR CONTÁBIL CAI NO CAMINHO QUE JÁ EXISTIA: `motivo: 'SEM_CUSTO'`,
    // o mesmo que um ativo sem custo cadastrado produz. Nenhuma tela precisou
    // aprender um caso novo, e nenhuma linha de código precisou de um `if` —
    // o select não trouxe o custo, então a função de cálculo recebeu o mesmo
    // nada que recebe quando o custo não foi preenchido.
    expect((resposta.body.valorContabil as { motivo: string }).motivo).toBe('SEM_CUSTO');
  });

  it('quem TEM a chave continua vendo as duas coisas', async () => {
    // A metade esquecida do teste de permissão: provar que a chave ABRE é o que
    // impede uma implementação que esconde de todos e passa no caso de cima.
    const resposta = await api.get<Record<string, unknown>>(`/api/assets/${assetId}`);

    expect(resposta.body.purchaseCost).toBe('4250.9');
    expect((resposta.body.model as Record<string, unknown>).depreciation).toBeDefined();
  });

  it('o relatório de depreciação é 403 na ROTA inteira', async () => {
    // D138: filtrar a coluna num relatório que só fala de dinheiro não quer
    // dizer nada. Um 200 com todos os números nulos pareceria frota sem valor
    // cadastrado — pior do que a recusa.
    const resposta = await semSegredo.get('/api/reports/depreciacao');
    expect(resposta.status).toBe(403);
  });

  it('o relatório de responsabilidade abre, mas sem a soma de custo', async () => {
    // Ele responde "quem responde por quantos equipamentos", que é a pergunta
    // principal e não é sobre dinheiro. Só a coluna de custo some.
    const resposta = await semSegredo.get<{ linhas: { total: number; custoTotal: unknown }[] }>(
      '/api/reports/responsabilidade',
    );

    expect(resposta.status).toBe(200);
    for (const linha of resposta.body.linhas) {
      // A contagem continua — é a pergunta principal do relatório.
      expect(linha.total).toBeGreaterThan(0);
      expect(linha.custoTotal).toBeNull();
    }
  });

  it('o EXPORT recusa a coluna de custo pedida pelo nome', async () => {
    // Aqui o mecanismo é outro, de propósito: não dá para "não ler" uma coluna
    // que o usuário pediu pelo nome. O honesto é dizer que ele não pode pedi-la
    // — e antes do primeiro byte, senão o cliente recebe um CSV truncado com
    // status 200.
    const resposta = await semSegredo.get<{ error: string }>(
      '/api/assets/export?columns=assetTag,purchaseCost',
    );

    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toMatch(/purchaseCost/);
  });

  it('o EXPORT sem escolher coluna funciona, já sem a de custo', async () => {
    // O padrão inclui `purchaseCost`. Se ele não fosse filtrado, quem não tem a
    // chave tomaria 403 ao baixar sem escolher nada — e não há nada de errado
    // em não escolher.
    const resposta = await semSegredo.get<string>('/api/assets/export');

    expect(resposta.status).toBe(200);
    expect(typeof resposta.body).toBe('string');
    expect(resposta.body).not.toMatch(/Custo de compra/);
    // E continua sendo um CSV de verdade, com as outras colunas.
    expect(resposta.body).toMatch(/Etiqueta/);
  });

  it('o BUILDER recusa a coluna e não a oferece no seletor', async () => {
    const negado = await semSegredo.post<{ error: string }>('/api/reports/custom', {
      columns: ['assetTag', 'purchaseCost'],
    });
    expect(negado.status).toBe(403);

    // E a tela não chega a oferecê-la: o seletor é montado com esta lista, e uma
    // opção que sempre dá 403 faz a pessoa marcar, gerar, errar e não saber qual
    // das quinze colunas causou.
    const campos = await semSegredo.get<{ colunas: string[] }>('/api/reports/builder/fields');
    expect(campos.body.colunas).not.toContain('purchaseCost');
    expect(campos.body.colunas).toContain('assetTag');
  });

  it('o builder AGRUPA sem a soma, para quem não vê dinheiro', async () => {
    const resposta = await semSegredo.post<{ grupos: { ativos: number; custoTotal: unknown }[] }>(
      '/api/reports/custom',
      { columns: ['assetTag'], agruparPor: 'status' },
    );

    expect(resposta.status).toBe(200);
    // Contar continua: é a parte do relatório que não é sobre custo.
    expect(resposta.body.grupos.length).toBeGreaterThan(0);
    for (const grupo of resposta.body.grupos) {
      expect(grupo.ativos).toBeGreaterThan(0);
      expect(grupo.custoTotal).toBeNull();
    }
  });
});

describe('chave de produto — `licenses.viewKey`', () => {
  it('a rota de revelar é 403', async () => {
    const resposta = await semSegredo.get(`/api/licenses/${licenseId}/product-key`);
    expect(resposta.status).toBe(403);
  });

  it('o detalhe não traz nem a MÁSCARA, mas diz que existe chave', async () => {
    const resposta = await semSegredo.get<{ productKeyMask: unknown; hasProductKey: boolean }>(
      `/api/licenses/${licenseId}`,
    );

    expect(resposta.status).toBe(200);
    // A MÁSCARA TAMBÉM É A CHAVE, em pedaço menor: ela revela os últimos
    // caracteres, que é um fragmento do segredo.
    expect(resposta.body.productKeyMask).toBeNull();
    // Mas "esta licença tem chave guardada" é fato de cadastro, não segredo — e
    // é o que a tela precisa para saber se mostra o botão de revelar.
    expect(resposta.body.hasProductKey).toBe(true);
  });

  it('quem TEM a chave vê a máscara e revela', async () => {
    const detalhe = await api.get<{ productKeyMask: string }>(`/api/licenses/${licenseId}`);
    expect(detalhe.body.productKeyMask).toBeTruthy();

    const revelada = await api.get<{ productKey: string }>(`/api/licenses/${licenseId}/product-key`);
    expect(revelada.status).toBe(200);
    expect(revelada.body.productKey).toBe('AAAAA-BBBBB-CCCCC-DDDDD');
  });

  it('EDITAR a licença não vaza a máscara para quem só pode editar', async () => {
    // O caso que obriga a permissão a entrar na ESCRITA: salvar o nome da
    // licença, sem tocar na chave, devolvia a máscara da chave que já estava
    // lá. Quem tem `licenses.edit` e não tem `licenses.viewKey` leria um
    // fragmento do segredo salvando um campo que não tem nada a ver com ele.
    const editor = await api.comoUsuario(['licenses.view', 'licenses.edit']);

    const resposta = await editor.put<{ productKeyMask: unknown; hasProductKey: boolean }>(
      `/api/licenses/${licenseId}`,
      { name: 'Office com chave (renomeado)' },
    );

    expect(resposta.status).toBe(200);
    expect(resposta.body.productKeyMask).toBeNull();
    expect(resposta.body.hasProductKey).toBe(true);
  });
});

describe('o que NÃO muda — o limite do D77 (D140)', () => {
  it('o campo customizado cifrado continua MASCARADO na resposta', async () => {
    // EM JSONB NÃO EXISTE `select` PARCIAL: `Asset.customFields` é UMA coluna
    // com valor cifrado e comum lado a lado, e foi por isso que o prefixo `enc:`
    // passou a viajar dentro do valor (D81, item 1).
    //
    // Então aqui mascarar depois NÃO é exceção ao D77 — é o limite dele. Este
    // caso existe para que a próxima pessoa a aplicar o D77 ao pé da letra não
    // "conserte" a F9 tentando filtrar o que não se filtra.
    const resposta = await api.get<{ customFields: unknown; temSegredo: boolean }>(
      `/api/assets/${assetId}`,
    );

    expect(resposta.status).toBe(200);
    // Sem campo cifrado neste ativo, o contrato é `null` — e é o mesmo contrato
    // da coluna. O que importa aqui é que a propriedade EXISTE e passou pelo
    // mascarador, que é a única saída de uma linha com `customFields`.
    expect(Object.hasOwn(resposta.body, 'customFields')).toBe(true);
    expect(resposta.body.temSegredo).toBe(false);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarColaborador, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { corpoMultipart } from '../helpers/multipart';

// A COLUNA *RESPONSÁVEL* NUM ATIVO QUE JÁ EXISTE (F10, Etapa D) — e a pergunta
// que o dry-run não estava fazendo.
//
// ═════════════════════════════════════════════════════════════════════════════
// O DRY-RUN E O APPLY TÊM DE CONCORDAR. É A RAZÃO DE EXISTIREM DOIS PASSOS.
//
// `checkoutAsset` recusa com 409 — "Só ativo disponível pode ser entregue" — o
// ativo que não está `DEPLOYABLE`. A regra é certa: é a invariante 4, e é ela
// que dá sentido ao `StatusLabelType`.
//
// O que estava errado era QUANDO a recusa aparecia. O `planejar` lia a posse
// aberta do ativo existente e não lia o STATUS dele, então a simulação prometia
// "entrega a Laura" e o apply devolvia ERRO naquela linha. Ver a tela dizer OK e
// o arquivo falhar depois é exatamente a divergência que o D68 existe para não
// ter — e é a pior forma dela, porque aparece só depois do clique irreversível.
//
// E O CASO É REAL, NÃO TEÓRICO: ativo "Em uso" SEM posse aberta é legítimo (é o
// posto vago da invariante 4), e é o estado em que uma planilha de correção
// encontra metade do parque de quem está arrumando o cadastro — justamente o
// trabalho para o qual a importação existe.
//
// O ativo NOVO não tem o problema: `planejarCriacao` o cria DISPONÍVEL de
// propósito e passa o status do arquivo como `statusId` da ENTREGA, que é um
// parâmetro que o checkout já aceita e aplica. O teste de baixo prova os dois
// lados: o novo passa, o existente mal-posicionado é recusado NA SIMULAÇÃO.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelo = '';

const EMAIL = 'laura.posse-importada@teste.local';

interface ImportacaoNaResposta {
  id: string;
  status: string;
  totalLinhas: number;
  ok: number;
  erro: number;
  ignorada: number;
}

interface LinhaNaResposta {
  lineNumber: number;
  status: string;
  message: string | null;
  entityId: string | null;
}

const MAPEAMENTO = JSON.stringify({
  chave: 'assetTag',
  colunas: { Etiqueta: 'assetTag', Modelo: 'model', 'Responsável': 'responsavel' },
});

async function subir(csv: string, mapping: string = MAPEAMENTO) {
  const { payload, headers } = corpoMultipart(
    'posse.csv',
    'text/csv',
    Buffer.from(csv, 'utf8'),
    { target: 'ASSETS', mapping },
  );

  const resposta = await api.app.inject({
    method: 'POST',
    url: '/api/imports',
    headers: { ...headers, cookie: api.cookie },
    payload,
  });

  expect(resposta.statusCode).toBe(201);
  return JSON.parse(resposta.body) as ImportacaoNaResposta;
}

async function linhasDe(id: string) {
  const { body } = await api.get<{ rows: LinhaNaResposta[] }>(`/api/imports/${id}/rows?perPage=100`);
  return body.rows;
}

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();

  const fabricanteId = await criarFabricante(api, 'Dell da Posse Importada');
  await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId, name: 'Latitude da Posse' });
  modelo = 'Latitude da Posse';

  await criarColaborador(api, { name: 'Laura da Posse', email: EMAIL });
});

afterAll(async () => {
  await api.fechar();
});

describe('a simulação recusa a entrega que o apply recusaria', () => {
  it('ativo EXISTENTE fora de "disponível" é ERRO no DRY-RUN, dizendo o status e o que fazer', async () => {
    // Em uso, e SEM posse aberta: o estado que a invariante 4 permite e que o
    // checkout não aceita como ponto de partida.
    const emUso = await criarAtivo(api, {
      statusId: seed.statusEmUsoId,
      modelId: await modelIdDoNome(),
    });

    const importacao = await subir(
      `Etiqueta;Modelo;Responsável\r\n${emUso.assetTag};${modelo};${EMAIL}\r\n`,
    );

    expect(importacao.ok).toBe(0);
    expect(importacao.erro).toBe(1);

    const [linha] = await linhasDe(importacao.id);
    expect(linha.status).toBe('ERRO');
    // A mensagem nomeia o status atual: sem isso, quem lê o relatório não sabe
    // qual dos 500 ativos arrumar nem para onde.
    expect(linha.message).toMatch(/só ativo disponível pode ser entregue/i);
    expect(linha.message).toMatch(/status disponível/i);
  });

  it('e o apply não grava nada dessa linha — nenhuma posse foi aberta', async () => {
    const emUso = await criarAtivo(api, {
      statusId: seed.statusEmUsoId,
      modelId: await modelIdDoNome(),
    });

    const importacao = await subir(
      `Etiqueta;Modelo;Responsável\r\n${emUso.assetTag};${modelo};${EMAIL}\r\n`,
    );

    await api.post(`/api/imports/${importacao.id}/apply`);

    // A PROVA: a linha recusada na simulação não é nem tentada no apply, então o
    // ativo continua sem posse — e sem um termo pendente que ninguém pediu.
    expect(await prisma.assignment.count({ where: { assetId: emUso.id } })).toBe(0);
    expect(await prisma.acceptance.count({ where: { assetId: emUso.id } })).toBe(0);
  });

  it('ativo DISPONÍVEL continua recebendo a posse: a guarda é do status, não da coluna', async () => {
    // O CONTROLE POSITIVO. Sem ele, os dois testes acima passariam igual se a
    // coluna *Responsável* tivesse parado de funcionar por qualquer motivo.
    const disponivel = await criarAtivo(api, {
      statusId: seed.statusDeployableId,
      modelId: await modelIdDoNome(),
    });

    const importacao = await subir(
      `Etiqueta;Modelo;Responsável\r\n${disponivel.assetTag};${modelo};${EMAIL}\r\n`,
    );

    expect(importacao.ok).toBe(1);

    const { status } = await api.post(`/api/imports/${importacao.id}/apply`);
    expect(status).toBe(200);

    const posse = await prisma.assignment.findFirst({
      where: { assetId: disponivel.id, checkinAt: null },
      select: { targetType: true },
    });

    expect(posse?.targetType).toBe('USER');
    // E SILENCIOSA (D131): equipamento que a pessoa já tem não ganha termo para
    // assinar, nem e-mail convidando a assiná-lo.
    expect(await prisma.acceptance.count({ where: { assetId: disponivel.id } })).toBe(0);
  });

  it('ativo NOVO com responsável nasce disponível e a ENTREGA aplica o status', async () => {
    // O caminho que a fase desenhou: o importador não escreve status à mão —
    // cria no estoque e deixa o checkout mover. Aqui o arquivo não traz coluna
    // de status, então vale o padrão da entrega.
    const importacao = await subir(
      `Etiqueta;Modelo;Responsável\r\nATV-NOVO-POSSE;${modelo};${EMAIL}\r\n`,
    );

    expect(importacao.ok).toBe(1);
    await api.post(`/api/imports/${importacao.id}/apply`);

    const criado = await prisma.asset.findFirst({
      where: { assetTag: 'ATV-NOVO-POSSE' },
      select: { id: true, status: { select: { type: true } } },
    });

    expect(criado).not.toBeNull();
    expect(criado?.status.type).toBe('IN_USE');
    expect(await prisma.assignment.count({ where: { assetId: criado!.id, checkinAt: null } })).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O QUE MUDOU DE VERDADE: TEXTO É TEXTO.
//
// A comparação entre a célula do arquivo e a coluna do banco existe para decidir
// IGNORADA ("já está como o arquivo pede") — e ela precisava de um caso especial
// para DINHEIRO: o custo chega do CSV como string (`1234.50`) e sai do Prisma
// como `Decimal`, então `'1234.5' !== '1234.50'` acusaria uma atualização que não
// muda nada.
//
// O caso especial estava largo demais: ele comparava como NÚMERO qualquer célula
// de texto cujo conteúdo parecesse número. A série "0012345" e a série "12345"
// davam 12345 as duas, então o importador as considerava iguais e DESCARTAVA a
// correção — em silêncio, com a linha marcada IGNORADA e "já está como o arquivo
// pede" no relatório. Número de série é dado FÍSICO, gravado na carcaça: o zero à
// esquerda faz parte dele, e é por ele que a reconciliação da F7 acha o
// equipamento.
//
// Valia igual para etiqueta e número de pedido com zero à esquerda.
// ═════════════════════════════════════════════════════════════════════════════

const MAPEAMENTO_COM_SERIE = JSON.stringify({
  chave: 'assetTag',
  colunas: { Etiqueta: 'assetTag', 'Série': 'serial', 'Nº do pedido': 'orderNumber' },
});

describe('o que conta como mudança', () => {
  it('zero à esquerda na SÉRIE é mudança, e a correção entra', async () => {
    const ativo = await criarAtivo(api, {
      statusId: seed.statusDeployableId,
      modelId: await modelIdDoNome(),
      serial: '12345',
    });

    const importacao = await subir(
      `Etiqueta;Série;Nº do pedido\r\n${ativo.assetTag};0012345;\r\n`,
      MAPEAMENTO_COM_SERIE,
    );

    // Antes: `ignorada: 1` com "Já está como o arquivo pede".
    expect(importacao.ok).toBe(1);
    expect(importacao.ignorada).toBe(0);

    await api.post(`/api/imports/${importacao.id}/apply`);

    const depois = await prisma.asset.findUniqueOrThrow({
      where: { id: ativo.id },
      select: { serial: true },
    });
    expect(depois.serial).toBe('0012345');
  });

  it('zero à esquerda no Nº DO PEDIDO também é mudança', async () => {
    const ativo = await criarAtivo(api, {
      statusId: seed.statusDeployableId,
      modelId: await modelIdDoNome(),
      serial: 'SN-PEDIDO-1',
    });
    await api.put(`/api/assets/${ativo.id}`, { orderNumber: '99' });

    const importacao = await subir(
      `Etiqueta;Série;Nº do pedido\r\n${ativo.assetTag};SN-PEDIDO-1;0099\r\n`,
      MAPEAMENTO_COM_SERIE,
    );

    expect(importacao.ok).toBe(1);
  });

  it('a célula IDÊNTICA continua sendo IGNORADA — o caso que a comparação existe para pegar', async () => {
    const ativo = await criarAtivo(api, {
      statusId: seed.statusDeployableId,
      modelId: await modelIdDoNome(),
      serial: 'SN-IGUAL-1',
    });

    const importacao = await subir(
      `Etiqueta;Série;Nº do pedido\r\n${ativo.assetTag};SN-IGUAL-1;\r\n`,
      MAPEAMENTO_COM_SERIE,
    );

    expect(importacao.ignorada).toBe(1);
    expect(importacao.ok).toBe(0);
  });

  it('o CUSTO com casa decimal a mais continua NÃO sendo mudança (o caso do `Decimal`)', async () => {
    // O controle que impede a correção acima de reintroduzir o ruído que o caso
    // especial existia para calar: `1234.5` e `1234.50` são o mesmo dinheiro, e
    // uma atualização por linha nisso encheria o `ActivityLog` de diffs vazios.
    const { body: criado } = await api.post<{ id: string; assetTag: string }>('/api/assets', {
      statusId: seed.statusDeployableId,
      modelId: await modelIdDoNome(),
      purchaseCost: '1234.50',
    });

    const importacao = await subir(
      `Etiqueta;Custo de compra\r\n${criado.assetTag};1234.5\r\n`,
      JSON.stringify({
        chave: 'assetTag',
        colunas: { Etiqueta: 'assetTag', 'Custo de compra': 'purchaseCost' },
      }),
    );

    expect(importacao.ignorada).toBe(1);
  });
});

/** O id do modelo criado no `beforeAll` — `criarAtivo` quer id, o CSV quer nome. */
async function modelIdDoNome(): Promise<string> {
  const achado = await prisma.assetModel.findFirstOrThrow({
    where: { name: modelo },
    select: { id: true },
  });
  return achado.id;
}

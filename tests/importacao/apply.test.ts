import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarColaborador, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { corpoMultipart } from '../helpers/multipart';

// O SEGUNDO PASSO (F10, Etapa D, D68) — e as três coisas que ele tem de acertar
// e que nenhuma tela mostraria:
//
//   1. A POSSE IMPORTADA PASSA PELO CHECKOUT (D17), com `checkoutAt`
//      RETROATIVO: o histórico de posse da empresa não pode nascer dizendo que
//      tudo foi entregue no dia da carga.
//
//   2. E PASSA EM SILÊNCIO (D131): zero termo de aceite, zero e-mail. É o
//      defeito 3 da auditoria — 500 linhas mandariam 500 convites para assinar
//      o recebimento de um notebook que a pessoa usa desde 2024, e o e-mail não
//      volta. A categoria deste arquivo EXIGE termo, justamente para a ausência
//      significar algo.
//
//   3. REIMPORTAR O MESMO ARQUIVO NÃO DUPLICA NADA: tudo IGNORADA.

let api: ApiDeTeste;
let modelo = '';
let statusEmUso = '';
const EMAIL_DA_LAURA = 'laura.import@teste.local';

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusEmUso = seed.statusEmUsoId;

  // CATEGORIA QUE EXIGE TERMO: é o que dá sentido à asserção de "zero
  // Acceptance". Numa categoria comum, o termo não nasceria de qualquer jeito e
  // o teste provaria nada.
  const categoria = await api.post<{ id: string }>('/api/categories', {
    name: 'Notebook com termo (import)',
    type: 'ASSET',
    requireAcceptance: true,
    eulaText: 'Declaro ter recebido o equipamento.',
  });

  const fabricanteId = await criarFabricante(api, 'Dell do Apply');
  await criarModelo(api, {
    categoriaId: categoria.body.id,
    fabricanteId,
    name: 'Latitude do Apply',
  });
  modelo = 'Latitude do Apply';

  await criarColaborador(api, { name: 'Laura do Import', email: EMAIL_DA_LAURA });
});

afterAll(async () => {
  await api.fechar();
});

interface Importacao {
  id: string;
  status: string;
  ok: number;
  erro: number;
  ignorada: number;
  appliedUpTo: number;
  totalLinhas: number;
}

interface Linha {
  lineNumber: number;
  status: string;
  message: string | null;
  entityId: string | null;
}

const COLUNAS_COM_POSSE = {
  Etiqueta: 'assetTag',
  Modelo: 'model',
  Status: 'status',
  Responsável: 'responsavel',
  'Entregue em': 'checkoutAt',
};

async function simular(csv: string, mapping: object, target = 'ASSETS') {
  const { payload, headers } = corpoMultipart('carga.csv', 'text/csv', Buffer.from(csv, 'utf8'), {
    target,
    mapping: JSON.stringify(mapping),
  });

  const resposta = await api.app.inject({
    method: 'POST', url: '/api/imports', headers: { ...headers, cookie: api.cookie }, payload,
  });

  return { status: resposta.statusCode, body: JSON.parse(resposta.body || '{}') as Importacao };
}

async function aplicar(id: string) {
  return api.post<Importacao & { error?: string }>(`/api/imports/${id}/apply`);
}

async function linhasDe(id: string) {
  const { body } = await api.get<{ rows: Linha[] }>(`/api/imports/${id}/rows?perPage=100`);
  return body.rows;
}

describe('POST /api/imports/:id/apply — ativos com posse retroativa', () => {
  it('cria o ativo, abre a posse com a data do arquivo e NÃO emite termo nem e-mail', async () => {
    const termosAntes = await prisma.acceptance.count();

    const simulacao = await simular(
      `Etiqueta;Modelo;Status;Responsável;Entregue em\r\n`
        + `ATV-IMP-100;${modelo};Em uso;${EMAIL_DA_LAURA};2024-03-20\r\n`,
      { chave: 'assetTag', colunas: COLUNAS_COM_POSSE },
    );

    expect(simulacao.body.ok).toBe(1);
    const linhaSimulada = (await linhasDe(simulacao.body.id))[0];
    expect(linhaSimulada.message).toMatch(/entrega a Laura do Import \(em 2024-03-20\)/);

    const aplicado = await aplicar(simulacao.body.id);
    expect(aplicado.status).toBe(200);
    expect(aplicado.body.status).toBe('APLICADO');
    expect(aplicado.body.ok).toBe(1);

    const ativo = await prisma.asset.findFirst({
      where: { assetTag: 'ATV-IMP-100' },
      select: {
        id: true,
        statusId: true,
        assignedToId: true,
        assignments: { select: { checkoutAt: true, targetType: true, targetUserId: true } },
      },
    });

    expect(ativo).not.toBeNull();
    // O STATUS DO ARQUIVO foi aplicado pela ENTREGA, não pela criação: o
    // checkout só aceita ativo `DEPLOYABLE`, então o ativo nasceu disponível e a
    // entrega o moveu (é a resposta da auditoria à pergunta em aberto nº 2).
    expect(ativo!.statusId).toBe(statusEmUso);
    expect(ativo!.assignments).toHaveLength(1);
    expect(ativo!.assignments[0].targetType).toBe('USER');
    // A DATA RETROATIVA, que é o ponto da leva D0.
    expect(ativo!.assignments[0].checkoutAt.toISOString().slice(0, 10)).toBe('2024-03-20');
    // E o cache do caso USER foi escrito pelo checkout, como em toda entrega.
    expect(ativo!.assignedToId).toBe(ativo!.assignments[0].targetUserId);

    // O SILÊNCIO (D131): nenhum termo novo, apesar de a categoria exigir termo.
    expect(await prisma.acceptance.count()).toBe(termosAntes);

    // A linha aponta para o que ela criou — é o caminho do desfazer à mão.
    const linhaAplicada = (await linhasDe(simulacao.body.id))[0];
    expect(linhaAplicada.entityId).toBe(ativo!.id);
  });

  it('reimportar o MESMO arquivo deixa tudo IGNORADA, sem criar nada', async () => {
    const csv = `Etiqueta;Modelo;Status;Responsável;Entregue em\r\n`
      + `ATV-IMP-100;${modelo};Em uso;${EMAIL_DA_LAURA};2024-03-20\r\n`;

    const antes = await prisma.asset.count();
    const simulacao = await simular(csv, { chave: 'assetTag', colunas: COLUNAS_COM_POSSE });

    expect(simulacao.body.ignorada).toBe(1);
    expect(simulacao.body.ok).toBe(0);

    const linha = (await linhasDe(simulacao.body.id))[0];
    expect(linha.message).toMatch(/Já está como o arquivo pede/);
    expect(await prisma.asset.count()).toBe(antes);
  });

  it('recusa a linha que tentaria TRANSFERIR posse em massa', async () => {
    await criarColaborador(api, { name: 'Outra Pessoa', email: 'outra.import@teste.local' });

    const simulacao = await simular(
      `Etiqueta;Modelo;Status;Responsável;Entregue em\r\n`
        + `ATV-IMP-100;${modelo};Em uso;outra.import@teste.local;2024-05-01\r\n`,
      { chave: 'assetTag', colunas: COLUNAS_COM_POSSE },
    );

    expect(simulacao.body.erro).toBe(1);
    const linha = (await linhasDe(simulacao.body.id))[0];
    expect(linha.message).toMatch(/já está entregue/i);
    expect(linha.message).toMatch(/devolução/i);
  });

  it('recusa e-mail de responsável que não existe, dizendo o que fazer', async () => {
    const simulacao = await simular(
      `Etiqueta;Modelo;Status;Responsável;Entregue em\r\n`
        + `ATV-IMP-101;${modelo};Em uso;nao.existe@teste.local;2024-03-20\r\n`,
      { chave: 'assetTag', colunas: COLUNAS_COM_POSSE },
    );

    const linha = (await linhasDe(simulacao.body.id))[0];
    expect(linha.status).toBe('ERRO');
    expect(linha.message).toMatch(/Importe as pessoas antes/);
  });

  it('recusa data de entrega no futuro e data sem responsável', async () => {
    const futuro = await simular(
      `Etiqueta;Modelo;Status;Responsável;Entregue em\r\n`
        + `ATV-IMP-102;${modelo};Em uso;${EMAIL_DA_LAURA};2099-01-01\r\n`,
      { chave: 'assetTag', colunas: COLUNAS_COM_POSSE },
    );
    expect((await linhasDe(futuro.body.id))[0].message).toMatch(/futuro/);

    const semResponsavel = await simular(
      `Etiqueta;Modelo;Entregue em\r\nATV-IMP-103;${modelo};2024-03-20\r\n`,
      {
        chave: 'assetTag',
        colunas: { Etiqueta: 'assetTag', Modelo: 'model', 'Entregue em': 'checkoutAt' },
      },
    );
    expect((await linhasDe(semResponsavel.body.id))[0].message).toMatch(/sem a coluna "Responsável"/);
  });

  it('aplicar duas vezes é 409: reaplicar duplicaria o que já entrou', async () => {
    const simulacao = await simular(
      `Etiqueta;Modelo\r\nATV-IMP-200;${modelo}\r\n`,
      { chave: 'assetTag', colunas: { Etiqueta: 'assetTag', Modelo: 'model' } },
    );

    expect((await aplicar(simulacao.body.id)).status).toBe(200);

    const segunda = await aplicar(simulacao.body.id);
    expect(segunda.status).toBe(409);
    expect(segunda.body.error).toMatch(/já foi aplicada/);
  });

  it('atualiza o ativo que já existe, e só o que o arquivo trouxe', async () => {
    const simulacao = await simular(
      `Etiqueta;Modelo;Nome\r\nATV-IMP-200;${modelo};Notebook renomeado\r\n`,
      { chave: 'assetTag', colunas: { Etiqueta: 'assetTag', Modelo: 'model', Nome: 'name' } },
    );

    expect(simulacao.body.ok).toBe(1);
    expect((await linhasDe(simulacao.body.id))[0].message).toMatch(/atualiza name/);

    await aplicar(simulacao.body.id);

    const ativo = await prisma.asset.findFirst({
      where: { assetTag: 'ATV-IMP-200' },
      select: { name: true, serial: true },
    });
    expect(ativo!.name).toBe('Notebook renomeado');
    // O que o arquivo não trouxe continua como estava: ausência é "não mexa",
    // nunca "apague".
    expect(ativo!.serial).toBeNull();
  });

  it('a etiqueta vazia é gerada pelo contador, e a linha diz isso', async () => {
    const antes = await prisma.asset.count();
    const simulacao = await simular(
      `Etiqueta;Modelo\r\n;${modelo}\r\n`,
      { chave: 'assetTag', colunas: { Etiqueta: 'assetTag', Modelo: 'model' } },
    );

    expect(simulacao.body.ok).toBe(1);
    await aplicar(simulacao.body.id);

    expect(await prisma.asset.count()).toBe(antes + 1);
  });

  it('casa o nome do status ignorando a caixa — a planilha escreve "Em uso"', async () => {
    // O seed cadastra "Em Uso"; o arquivo escreve "em uso". Nenhuma das duas
    // grafias está errada do ponto de vista de quem preenche a planilha, e
    // exigir a exata recusaria a carga inteira por uma letra.
    const simulacao = await simular(
      `Etiqueta;Modelo;Status
ATV-CAIXA-1;${modelo.toUpperCase()};em uso
`,
      { chave: 'assetTag', colunas: { Etiqueta: 'assetTag', Modelo: 'model', Status: 'status' } },
    );

    expect(simulacao.body.ok).toBe(1);
  });

  it('mas RECUSA quando dois cadastros diferem só na caixa — isso seria sorteio', async () => {
    // O índice único de `status_labels.name` é sensível a caixa, então o banco
    // permite os dois. Escolher um deles seria o D46 pelo avesso: evidência
    // ambígua tratada como evidência.
    await prisma.statusLabel.create({ data: { name: 'EM USO', type: 'IN_USE' } });

    const simulacao = await simular(
      `Etiqueta;Modelo;Status
ATV-CAIXA-2;${modelo};Em uso
`,
      { chave: 'assetTag', colunas: { Etiqueta: 'assetTag', Modelo: 'model', Status: 'status' } },
    );

    const linha = (await linhasDe(simulacao.body.id))[0];
    expect(linha.status).toBe('ERRO');
    expect(linha.message).toMatch(/mais de um status/i);
    expect(linha.message).toMatch(/Unifique o cadastro/);

    await prisma.statusLabel.deleteMany({ where: { name: 'EM USO' } });
  });

  it('recusa a linha sem série quando a SÉRIE é a chave', async () => {
    const simulacao = await simular(
      `Série;Modelo\r\n;${modelo}\r\n`,
      { chave: 'serial', colunas: { Série: 'serial', Modelo: 'model' } },
    );

    const linha = (await linhasDe(simulacao.body.id))[0];
    expect(linha.status).toBe('ERRO');
    expect(linha.message).toMatch(/número de série está vazia/);
  });
});

describe('POST /api/imports/:id/apply — pessoas', () => {
  // A COLUNA CONTINUA SENDO O NOME do departamento — ninguém digita uuid em
  // planilha. O que mudou na F11 (Etapa D) é que o importador RESOLVE nome → id
  // e recusa nome desconhecido, em vez de gravar o texto.
  const COLUNAS = { 'E-mail': 'email', Nome: 'name', Departamento: 'department' };

  /**
   * Os departamentos que as planilhas deste `describe` mencionam.
   *
   * Cadastrados pela ROTA, antes de importar — que é exatamente o fluxo que o
   * importador agora exige. Semeá-los com `prisma.department.create` pularia o
   * zod da borda, e é o que `tests/helpers/app.ts` existe para impedir.
   */
  beforeAll(async () => {
    for (const name of ['TI', 'Financeiro']) {
      const criado = await api.post('/api/departments', { name });
      // 409 é aceitável: outro `it` do arquivo pode ter criado antes.
      expect([201, 409]).toContain(criado.status);
    }
  });

  it('recusa a linha quando o departamento não está cadastrado', async () => {
    // D132 aplicado ao departamento: nome desconhecido é LINHA RECUSADA, nunca
    // departamento criado em silêncio. Um typo (`Comercail`) criaria um cadastro
    // ao lado do certo, e daí em diante o relatório por departamento mentiria
    // sem nenhum erro ter acontecido.
    const simulacao = await simular(
      `E-mail;Nome;Departamento\r\nsetor.novo@teste.local;Alguém;Comercail\r\n`,
      { chave: 'email', colunas: COLUNAS },
      'USERS',
    );

    expect(simulacao.body.erro).toBe(1);
    const linha = (await linhasDe(simulacao.body.id))[0];
    expect(linha.status).toBe('ERRO');
    // A mensagem NOMEIA o que foi digitado e diz onde cadastrar: é o dry-run
    // fazendo o trabalho dele.
    expect(linha.message).toMatch(/Comercail/);
    expect(linha.message).toMatch(/não está cadastrado/);
  });

  it('cadastra, atualiza e ignora — nessa ordem, no mesmo arquivo', async () => {
    const criar = await simular(
      `E-mail;Nome;Departamento\r\nnovo.import@teste.local;Pessoa Nova;TI\r\n`,
      { chave: 'email', colunas: COLUNAS },
      'USERS',
    );
    expect(criar.body.ok).toBe(1);
    await aplicar(criar.body.id);

    const pessoa = await prisma.user.findFirst({
      where: { email: 'novo.import@teste.local' },
      // A RELAÇÃO, não a coluna de texto: o nome do CSV foi resolvido para o id
      // do departamento cadastrado (F11, Etapa D).
      select: { name: true, department: { select: { name: true } } },
    });
    expect(pessoa?.name).toBe('Pessoa Nova');
    expect(pessoa?.department?.name).toBe('TI');

    // De novo, com departamento diferente: ATUALIZA.
    const atualizar = await simular(
      `E-mail;Nome;Departamento\r\nnovo.import@teste.local;Pessoa Nova;Financeiro\r\n`,
      { chave: 'email', colunas: COLUNAS },
      'USERS',
    );
    expect(atualizar.body.ok).toBe(1);
    await aplicar(atualizar.body.id);

    const depois = await prisma.user.findFirst({
      where: { email: 'novo.import@teste.local' },
      select: { department: { select: { name: true } } },
    });
    expect(depois!.department?.name).toBe('Financeiro');

    // E mais uma vez igual: IGNORADA.
    const igual = await simular(
      `E-mail;Nome;Departamento\r\nnovo.import@teste.local;Pessoa Nova;Financeiro\r\n`,
      { chave: 'email', colunas: COLUNAS },
      'USERS',
    );
    expect(igual.body.ignorada).toBe(1);
  });

  it('o e-mail casa em MINÚSCULAS: `Ana@X` acha `ana@x` e não cria uma segunda Ana', async () => {
    const maiusculo = await simular(
      `E-mail;Nome;Departamento\r\nNOVO.IMPORT@TESTE.LOCAL;Pessoa Nova;Financeiro\r\n`,
      { chave: 'email', colunas: COLUNAS },
      'USERS',
    );

    expect(maiusculo.body.ignorada).toBe(1);
    expect(await prisma.user.count({ where: { email: 'novo.import@teste.local' } })).toBe(1);
  });

  it('recusa pessoa nova sem nome e e-mail inválido', async () => {
    const semNome = await simular(
      `E-mail;Nome;Departamento\r\nsem.nome@teste.local;;TI\r\n`,
      { chave: 'email', colunas: COLUNAS },
      'USERS',
    );
    expect((await linhasDe(semNome.body.id))[0].message).toMatch(/precisa do nome/);

    const invalido = await simular(
      `E-mail;Nome;Departamento\r\nnao-e-email;Alguém;TI\r\n`,
      { chave: 'email', colunas: COLUNAS },
      'USERS',
    );
    expect((await linhasDe(invalido.body.id))[0].message).toMatch(/não é um e-mail válido/);
  });
});

describe('GET /api/imports', () => {
  it('lista as importações, mais recentes primeiro', async () => {
    const { status, body } = await api.get<{ total: number; rows: Importacao[] }>('/api/imports');

    expect(status).toBe(200);
    expect(body.total).toBeGreaterThan(0);
  });

  it('filtra as linhas por situação', async () => {
    const simulacao = await simular(
      `Etiqueta;Modelo\r\nATV-FIL-1;${modelo}\r\nATV-FIL-2;Modelo Inexistente\r\n`,
      { chave: 'assetTag', colunas: { Etiqueta: 'assetTag', Modelo: 'model' } },
    );

    const erros = await api.get<{ total: number; rows: Linha[] }>(
      `/api/imports/${simulacao.body.id}/rows?status=ERRO`,
    );

    expect(erros.body.total).toBe(1);
    expect(erros.body.rows[0].lineNumber).toBe(3);
  });

  it('404 em importação que não existe', async () => {
    const { status } = await api.get('/api/imports/00000000-0000-4000-8000-000000000000');
    expect(status).toBe(404);
  });
});

describe('GET /api/imports/template e /fields', () => {
  it('o modelo traz os títulos do alvo, com BOM e uma linha de exemplo', async () => {
    const resposta = await api.app.inject({
      method: 'GET', url: '/api/imports/template?target=ASSETS', headers: { cookie: api.cookie },
    });

    expect(resposta.statusCode).toBe(200);
    expect(Buffer.from(resposta.body, 'utf8').subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));

    const [cabecalho, exemplo] = resposta.body.replace('﻿', '').split('\r\n');
    expect(cabecalho.split(';')[0]).toBe('Etiqueta');
    expect(cabecalho).toContain('Responsável (e-mail)');
    expect(exemplo).toContain('ATV-00042');
  });

  it('os campos do alvo saem com rótulo, chave e ajuda — é o que a tela mapeia', async () => {
    const { status, body } = await api.get<{
      chaves: string[];
      campos: { token: string; rotulo: string; chave: boolean; ajuda: string | null }[];
    }>('/api/imports/fields?target=ASSETS');

    expect(status).toBe(200);
    expect(body.chaves).toEqual(['assetTag', 'serial']);
    expect(body.campos.find((campo) => campo.token === 'responsavel')?.ajuda).toMatch(/D17/);
  });

  it('OCCUPANTS não tem chave de uma coluna: a identidade é o par', async () => {
    const { body } = await api.get<{ chaves: string[] }>('/api/imports/fields?target=OCCUPANTS');
    expect(body.chaves).toEqual([]);
  });

  it('recusa alvo inválido', async () => {
    const { status } = await api.get('/api/imports/fields?target=TUDO');
    expect(status).toBe(422);
  });
});

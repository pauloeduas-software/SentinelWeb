import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { corpoMultipart } from '../helpers/multipart';

// O PRIMEIRO PASSO DA IMPORTAÇÃO (F10, Etapa D, D68) — e o que ele prova é uma
// AUSÊNCIA: depois de subir o arquivo, nada entrou no inventário.
//
// É a parte que não se vê pela tela e que nenhum teste de formulário pega: a
// simulação consulta o banco inteiro (modelo, status, localização, pessoa) e
// precisa sair sem escrever uma linha fora de `imports`/`import_rows`.

let api: ApiDeTeste;
let modelo = '';

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Dell do Import');
  await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId, name: 'Latitude 5420' });
  modelo = 'Latitude 5420';
});

afterAll(async () => {
  await api.fechar();
});

interface ImportacaoNaResposta {
  id: string;
  filename: string;
  target: string;
  status: string;
  delimiter: string;
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
  raw: Record<string, string>;
}

const MAPEAMENTO_DE_ATIVOS = JSON.stringify({
  chave: 'assetTag',
  colunas: { Etiqueta: 'assetTag', Modelo: 'model', Série: 'serial' },
});

/** Sobe um CSV. Os campos vão ANTES do arquivo, como um `<form>` monta. */
async function subir(
  csv: string,
  opcoes: { target?: string; mapping?: string; nome?: string; tipo?: string } = {},
) {
  const { payload, headers } = corpoMultipart(
    opcoes.nome ?? 'ativos.csv',
    opcoes.tipo ?? 'text/csv',
    Buffer.from(csv, 'utf8'),
    { target: opcoes.target ?? 'ASSETS', mapping: opcoes.mapping ?? MAPEAMENTO_DE_ATIVOS },
  );

  const resposta = await api.app.inject({
    method: 'POST',
    url: '/api/imports',
    headers: { ...headers, cookie: api.cookie },
    payload,
  });

  return {
    status: resposta.statusCode,
    body: JSON.parse(resposta.body || '{}') as ImportacaoNaResposta & { error?: string },
  };
}

async function linhasDe(id: string, status?: string) {
  const query = status ? `?status=${status}&perPage=100` : '?perPage=100';
  const { body } = await api.get<{ total: number; rows: LinhaNaResposta[] }>(
    `/api/imports/${id}/rows${query}`,
  );
  return body;
}

describe('POST /api/imports — a simulação', () => {
  it('grava o relatório e NÃO cria ativo nenhum', async () => {
    const antes = await prisma.asset.count();

    const { status, body } = await subir(
      `Etiqueta;Modelo;Série\r\nATV-SIM-1;${modelo};SN-SIM-1\r\nATV-SIM-2;${modelo};SN-SIM-2\r\n`,
    );

    expect(status).toBe(201);
    expect(body.status).toBe('SIMULADO');
    expect(body.totalLinhas).toBe(2);
    expect(body.ok).toBe(2);
    expect(body.erro).toBe(0);

    // A PROVA DA FASE: nada entrou.
    expect(await prisma.asset.count()).toBe(antes);
  });

  it('cada linha tem número, situação e o que VAI acontecer', async () => {
    const { body } = await subir(`Etiqueta;Modelo;Série\r\nATV-SIM-3;${modelo};SN-SIM-3\r\n`);
    const { rows } = await linhasDe(body.id);

    // O cabeçalho é a linha 1 — é o número que aparece no Excel.
    expect(rows[0].lineNumber).toBe(2);
    expect(rows[0].status).toBe('OK');
    expect(rows[0].message).toMatch(/Cadastra/);
    // Nada foi gravado, então não há entidade para apontar.
    expect(rows[0].entityId).toBeNull();
    // A linha CRUA fica guardada: é o que permite reler o relatório sem o arquivo.
    expect(rows[0].raw.Etiqueta).toBe('ATV-SIM-3');
  });

  it('o BOM no primeiro cabeçalho NÃO quebra o mapeamento', async () => {
    // A armadilha que o plano da fase nomeia: sem o strip, o primeiro cabeçalho
    // vira "\uFEFFEtiqueta", o mapeamento perde a coluna e o importador diz que
    // o arquivo não tem etiqueta — com a etiqueta ali, visível, na tela.
    const { status, body } = await subir(
      `\uFEFFEtiqueta;Modelo;Série\r\nATV-BOM-1;${modelo};SN-BOM-1\r\n`,
    );

    expect(status).toBe(201);
    expect(body.ok).toBe(1);
  });

  it('detecta o delimitador na linha de cabeçalho', async () => {
    const { body } = await subir(`Etiqueta,Modelo,Série\r\nATV-VIRG-1,${modelo},SN-VIRG-1\r\n`);

    expect(body.delimiter).toBe(',');
    expect(body.ok).toBe(1);
  });

  it('recusa arquivo que não é UTF-8, com a instrução do que fazer', async () => {
    // `Localização` em Windows-1252 — o que o Excel em português salva por padrão.
    const latin1 = Buffer.from([0x4c, 0x6f, 0x63, 0x61, 0x6c, 0x69, 0x7a, 0xe7, 0xe3, 0x6f, 0x0a]);
    const { payload, headers } = corpoMultipart('ativos.csv', 'text/csv', latin1, {
      target: 'ASSETS',
      mapping: MAPEAMENTO_DE_ATIVOS,
    });

    const resposta = await api.app.inject({
      method: 'POST', url: '/api/imports', headers: { ...headers, cookie: api.cookie }, payload,
    });
    const corpo = JSON.parse(resposta.body) as { error: string };

    expect(resposta.statusCode).toBe(422);
    expect(corpo.error).toMatch(/UTF-8/);
    expect(corpo.error).toMatch(/Salvar como/);
  });

  it('recusa cabeçalho repetido: o mapeamento ficaria ambíguo', async () => {
    const { status, body } = await subir(`Etiqueta;Modelo;Etiqueta\r\nATV-X;${modelo};ATV-Y\r\n`);

    expect(status).toBe(422);
    expect(body.error).toMatch(/repetido/i);
  });

  it('recusa coluna sem título', async () => {
    const { status, body } = await subir(`Etiqueta;;Série\r\nATV-X;y;SN\r\n`);

    expect(status).toBe(422);
    expect(body.error).toMatch(/sem nome/i);
  });

  it('recusa campo desconhecido no mapeamento, com a lista dos válidos', async () => {
    const { status, body } = await subir(
      `Etiqueta;Modelo\r\nATV-X;${modelo}\r\n`,
      {
        mapping: JSON.stringify({
          chave: 'assetTag',
          colunas: { Etiqueta: 'assetTag', Modelo: 'passwordHash' },
        }),
      },
    );

    expect(status).toBe(422);
    expect(body.error).toMatch(/Campo desconhecido/);
    expect((body as unknown as { validos: string[] }).validos).toContain('model');
  });

  it('recusa mapeamento que aponta para uma coluna que o arquivo não tem', async () => {
    const { status, body } = await subir(
      `Etiqueta;Modelo\r\nATV-X;${modelo}\r\n`,
      {
        mapping: JSON.stringify({
          chave: 'assetTag',
          colunas: { Etiqueta: 'assetTag', 'Nº de série': 'serial' },
        }),
      },
    );

    expect(status).toBe(422);
    expect(body.error).toMatch(/não tem a coluna/);
  });

  it('recusa arquivo sem a coluna da CHAVE mapeada', async () => {
    const { status, body } = await subir(
      `Modelo;Série\r\n${modelo};SN-1\r\n`,
      { mapping: JSON.stringify({ chave: 'assetTag', colunas: { Modelo: 'model', Série: 'serial' } }) },
    );

    expect(status).toBe(422);
    expect(body.error).toMatch(/chave de atualização/i);
  });

  it('recusa mapeamento que não é JSON válido', async () => {
    const { status, body } = await subir(`Etiqueta;Modelo\r\nATV-X;${modelo}\r\n`, {
      mapping: '{ isto não é json',
    });

    expect(status).toBe(422);
    expect(body.error).toMatch(/JSON/i);
  });

  it('marca ERRO por linha, sem derrubar o arquivo inteiro', async () => {
    const { body } = await subir(
      `Etiqueta;Modelo;Série\r\nATV-OK-1;${modelo};SN-OK-1\r\nATV-ERR-1;Modelo Que Não Existe;SN-ERR-1\r\n`,
    );

    expect(body.ok).toBe(1);
    expect(body.erro).toBe(1);

    const { rows } = await linhasDe(body.id, 'ERRO');
    expect(rows[0].lineNumber).toBe(3);
    expect(rows[0].message).toMatch(/não está cadastrado/);
  });

  it('recusa linha nova sem modelo', async () => {
    const { body } = await subir(
      `Etiqueta;Modelo;Série\r\nATV-SEM-MOD;;SN-SEM-MOD\r\n`,
    );

    const { rows } = await linhasDe(body.id, 'ERRO');
    expect(rows[0].message).toMatch(/precisa do modelo/);
  });

  it('o alvo de OCUPAÇÃO recusa local inexistente POR LINHA, com o que fazer', async () => {
    const { body } = await subir(
      `Local;Colaborador\r\nMesa Que Não Existe;laura@teste.local\r\n`,
      {
        target: 'OCCUPANTS',
        // SEM `chave`: em OCCUPANTS a identidade é o par (local, colaborador),
        // e mandar uma chave aqui é 422.
        mapping: JSON.stringify({
          colunas: { Local: 'local', Colaborador: 'colaborador' },
        }),
      },
    );

    // O arquivo inteiro NÃO é recusado: a linha é. O comportamento da ocupação
    // tem arquivo próprio (`ocupacao.test.ts`); aqui só se prova que o alvo
    // entra pelo mesmo motor e devolve motivo por linha.
    const { rows } = await linhasDe(body.id, 'ERRO');
    expect(rows[0].message).toMatch(/Cadastre o posto antes/);
  });

  it('exige sessão', async () => {
    const { payload, headers } = corpoMultipart('x.csv', 'text/csv', Buffer.from('a;b\n1;2\n'), {
      target: 'ASSETS', mapping: MAPEAMENTO_DE_ATIVOS,
    });
    const resposta = await api.app.inject({ method: 'POST', url: '/api/imports', headers, payload });

    expect(resposta.statusCode).toBe(401);
  });
});

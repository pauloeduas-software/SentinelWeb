import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo, criarLocal } from '../helpers/fixtures';
import { corpoMultipart } from '../helpers/multipart';

// A IMPORTAÇÃO DE OCUPAÇÃO (F10, Etapa E) — e o que este arquivo prova é o
// EFEITO QUE NÃO ESTÁ EM NENHUMA LINHA.
//
// Importar ocupação escreve em `location_occupants` e em nada mais. Mas quem
// responde por um ativo entregue a um POSTO são os ocupantes abertos daquele
// posto (Camada 3), então uma linha aqui muda quem responde por todo
// equipamento daquela mesa — sem tocar em uma `Assignment` sequer.
//
// Linha por linha, um arquivo com a coluna *Local* trocada parece perfeito. O
// que denuncia é o agregado: "412 ativos passam a ter responsável". É esse
// número que o dry-run desta etapa calcula, e é ele que este arquivo testa.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;
let mesaVazia = '';
let emailLaura = '';
let emailAna = '';

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api, ' (ocup)');
  // O cenário JÁ cria as duas pessoas, com o sufixo sanitizado no e-mail
  // (`laura.ocup@teste.local`). Criá-las de novo aqui é 409 vindo de dentro do
  // fixture, que se lê como defeito da aplicação e não do teste.
  emailLaura = 'laura.ocup@teste.local';
  emailAna = 'ana.ocup@teste.local';
  mesaVazia = await criarLocal(api, { name: 'Mesa Vazia (ocup)', isWorkstation: true });
});

afterAll(async () => {
  await api.fechar();
});

interface Importacao {
  id: string;
  ok: number;
  erro: number;
  ignorada: number;
  ganhamResponsavel: number | null;
  perdemResponsavel: number | null;
}

interface Linha {
  lineNumber: number;
  status: string;
  message: string | null;
}

const COLUNAS = {
  Local: 'local',
  Colaborador: 'colaborador',
  Turno: 'turno',
  Inicio: 'inicio',
  Fim: 'fim',
};

async function simular(csv: string) {
  const { payload, headers } = corpoMultipart('postos.csv', 'text/csv', Buffer.from(csv, 'utf8'), {
    target: 'OCCUPANTS',
    // SEM `chave`: a identidade é o par (local, colaborador), garantida pelo
    // índice único parcial do banco.
    mapping: JSON.stringify({ colunas: COLUNAS }),
  });

  const resposta = await api.app.inject({
    method: 'POST', url: '/api/imports', headers: { ...headers, cookie: api.cookie }, payload,
  });

  return { status: resposta.statusCode, body: JSON.parse(resposta.body || '{}') as Importacao };
}

async function aplicar(id: string) {
  return api.post<Importacao>(`/api/imports/${id}/apply`);
}

async function linhasDe(id: string) {
  const { body } = await api.get<{ rows: Linha[] }>(`/api/imports/${id}/rows?perPage=100`);
  return body.rows;
}

const CABECALHO = 'Local;Colaborador;Turno;Inicio;Fim\r\n';

describe('O efeito de segunda ordem, contado no dry-run', () => {
  it('conta os ativos que PASSAM a ter responsável quando a mesa vazia é ocupada', async () => {
    // Três ativos entregues a uma mesa SEM ocupante: ninguém responde por eles.
    const ativos = await Promise.all([
      criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId }),
      criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId }),
      criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId }),
    ]);

    for (const ativo of ativos) {
      const entrega = await api.post(`/api/assets/${ativo.id}/checkout`, {
        targetType: 'LOCATION', targetLocationId: mesaVazia,
      });
      expect(entrega.status).toBe(201);
    }

    const simulacao = await simular(
      `${CABECALHO}Mesa Vazia (ocup);${emailLaura};manhã;2024-02-01;\r\n`,
    );

    expect(simulacao.body.ok).toBe(1);
    // UMA linha de ocupação, TRÊS ativos trocando de responsável. É o número
    // que nenhuma linha do relatório mostraria.
    expect(simulacao.body.ganhamResponsavel).toBe(3);
    expect(simulacao.body.perdemResponsavel).toBe(0);

    // E nada foi gravado ainda.
    expect(await prisma.locationOccupant.count({ where: { locationId: mesaVazia } })).toBe(0);
  });

  it('a SEGUNDA pessoa na mesma mesa não conta: os ativos já tinham responsável', async () => {
    // Aplica a primeira.
    const primeira = await simular(`${CABECALHO}Mesa Vazia (ocup);${emailLaura};manhã;2024-02-01;\r\n`);
    await aplicar(primeira.body.id);

    const segunda = await simular(`${CABECALHO}Mesa Vazia (ocup);${emailAna};tarde;2024-03-01;\r\n`);

    expect(segunda.body.ok).toBe(1);
    // O posto vai de UM para DOIS ocupantes: os três ativos continuam com
    // responsável (agora dois), e isso não é uma mudança de responsabilidade.
    expect(segunda.body.ganhamResponsavel).toBe(0);
    expect(segunda.body.perdemResponsavel).toBe(0);

    await aplicar(segunda.body.id);
  });

  it('conta os que PERDEM quando o último ocupante sai', async () => {
    // As duas saem no mesmo arquivo: o posto fica vazio, e os três ativos
    // deixam de ter quem responda por eles (D28 — a posse continua aberta).
    const saida = await simular(
      `${CABECALHO}Mesa Vazia (ocup);${emailLaura};;;2024-06-30\r\n`
        + `Mesa Vazia (ocup);${emailAna};;;2024-06-30\r\n`,
    );

    expect(saida.body.ok).toBe(2);
    expect(saida.body.perdemResponsavel).toBe(3);
    expect(saida.body.ganhamResponsavel).toBe(0);
  });
});

describe('POST /api/imports — ocupação', () => {
  it('abre a ocupação com a data do arquivo, não com a de hoje', async () => {
    const simulacao = await simular(
      `${CABECALHO}Mesa 1 (ocup);${emailLaura};manhã;2024-01-15;\r\n`,
    );

    expect(simulacao.body.ok).toBe(1);
    await aplicar(simulacao.body.id);

    const ocupacao = await prisma.locationOccupant.findFirst({
      where: { locationId: cenario.mesa1, endedAt: null },
      select: { startedAt: true, shift: true },
    });

    expect(ocupacao!.startedAt.toISOString().slice(0, 10)).toBe('2024-01-15');
    expect(ocupacao!.shift).toBe('manhã');
  });

  it('reimportar o MESMO arquivo deixa tudo IGNORADA', async () => {
    const simulacao = await simular(`${CABECALHO}Mesa 1 (ocup);${emailLaura};manhã;2024-01-15;\r\n`);

    expect(simulacao.body.ignorada).toBe(1);
    expect(simulacao.body.ok).toBe(0);
    expect((await linhasDe(simulacao.body.id))[0].message).toMatch(/já ocupa/);
  });

  it('turno diferente CORRIGE a linha aberta, sem fabricar saída e volta', async () => {
    const antes = await prisma.locationOccupant.findFirst({
      where: { locationId: cenario.mesa1, endedAt: null },
      select: { id: true, startedAt: true },
    });

    const simulacao = await simular(`${CABECALHO}Mesa 1 (ocup);${emailLaura};tarde;2024-01-15;\r\n`);
    expect(simulacao.body.ok).toBe(1);
    expect((await linhasDe(simulacao.body.id))[0].message).toMatch(/Corrige o turno/);

    await aplicar(simulacao.body.id);

    const depois = await prisma.locationOccupant.findMany({
      where: { locationId: cenario.mesa1 },
      select: { id: true, shift: true, startedAt: true, endedAt: true },
    });

    // UMA linha, a MESMA linha, com o mesmo `startedAt`: encerrar e reabrir
    // diria que a pessoa saiu do posto e voltou por causa de um typo.
    expect(depois).toHaveLength(1);
    expect(depois[0].id).toBe(antes!.id);
    expect(depois[0].shift).toBe('tarde');
    expect(depois[0].endedAt).toBeNull();
    expect(depois[0].startedAt.toISOString()).toBe(antes!.startedAt.toISOString());
  });

  it('`Fim` vazio não encerra nada — é "continua", não "encerre as outras"', async () => {
    const abertas = await prisma.locationOccupant.count({
      where: { locationId: cenario.mesa1, endedAt: null },
    });

    await simular(`${CABECALHO}Mesa 1 (ocup);${emailLaura};tarde;2024-01-15;\r\n`);

    expect(await prisma.locationOccupant.count({
      where: { locationId: cenario.mesa1, endedAt: null },
    })).toBe(abertas);
  });

  it('`Fim` preenchido encerra COM A DATA do arquivo', async () => {
    const simulacao = await simular(`${CABECALHO}Mesa 1 (ocup);${emailLaura};;;2024-08-31\r\n`);

    expect(simulacao.body.ok).toBe(1);
    await aplicar(simulacao.body.id);

    const encerrada = await prisma.locationOccupant.findFirst({
      where: { locationId: cenario.mesa1, userId: cenario.laura },
      select: { endedAt: true },
      orderBy: { startedAt: 'desc' },
    });

    expect(encerrada!.endedAt?.toISOString().slice(0, 10)).toBe('2024-08-31');
  });

  it('encerrar o que não está aberto é IGNORADA, não erro', async () => {
    const simulacao = await simular(`${CABECALHO}Mesa 1 (ocup);${emailLaura};;;2024-09-30\r\n`);

    expect(simulacao.body.ignorada).toBe(1);
    expect((await linhasDe(simulacao.body.id))[0].message).toMatch(/não tem ocupação aberta/);
  });

  it('recusa saída anterior à entrada', async () => {
    await simular(`${CABECALHO}Mesa 1 (ocup);${emailAna};manhã;2024-05-01;\r\n`)
      .then((s) => aplicar(s.body.id));

    const simulacao = await simular(`${CABECALHO}Mesa 1 (ocup);${emailAna};;;2024-01-01\r\n`);

    expect(simulacao.body.erro).toBe(1);
    expect((await linhasDe(simulacao.body.id))[0].message).toMatch(/anterior à entrada/);
  });

  it('recusa local que não existe, dizendo para cadastrar antes', async () => {
    const simulacao = await simular(`${CABECALHO}Mesa Que Não Existe;${emailLaura};manhã;;\r\n`);

    expect(simulacao.body.erro).toBe(1);
    expect((await linhasDe(simulacao.body.id))[0].message).toMatch(/Cadastre o posto antes/);
  });

  it('recusa e-mail que não existe e início no futuro', async () => {
    const semPessoa = await simular(`${CABECALHO}Mesa 1 (ocup);ninguem@teste.local;manhã;;\r\n`);
    expect((await linhasDe(semPessoa.body.id))[0].message).toMatch(/Importe as pessoas antes/);

    const futuro = await simular(`${CABECALHO}Mesa 1 (ocup);${emailLaura};manhã;2099-01-01;\r\n`);
    expect((await linhasDe(futuro.body.id))[0].message).toMatch(/futuro/);
  });

  it('recusa mapeamento com chave: em OCCUPANTS a identidade é o par', async () => {
    const { payload, headers } = corpoMultipart(
      'postos.csv', 'text/csv', Buffer.from(`${CABECALHO}Mesa 1 (ocup);${emailLaura};;;\r\n`, 'utf8'),
      { target: 'OCCUPANTS', mapping: JSON.stringify({ chave: 'local', colunas: COLUNAS }) },
    );

    const resposta = await api.app.inject({
      method: 'POST', url: '/api/imports', headers: { ...headers, cookie: api.cookie }, payload,
    });

    expect(resposta.statusCode).toBe(422);
    expect(JSON.parse(resposta.body).error).toMatch(/não usa chave/);
  });
});

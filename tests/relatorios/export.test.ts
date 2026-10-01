import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, criarAtivo, criarFabricante, criarLicenca, criarModelo, idsDoSeed,
} from '../helpers/fixtures';

// O EXPORT CSV PELA ROTA (F10, Etapa C).
//
// O arquivo vizinho (`export.puro.test.ts`) prova a CÉLULA. Aqui se prova o que
// só a rota pode errar:
//
//   1. o BOM chega de verdade no corpo da resposta (sem ele, acento quebrado no
//      Excel em pt-BR — a razão declarada no TODO);
//   2. os filtros da TELA valem no arquivo. Um export que ignora o filtro
//      entrega 5.000 linhas a quem pediu 12, e a pessoa descobre contando;
//   3. a CHAVE DE PRODUTO não sai no CSV de licenças. É a quarta porta por onde
//      ela poderia vazar — as outras três foram fechadas na F6 — e a pior das
//      quatro, porque um arquivo circula por e-mail;
//   4. token de coluna fora da allowlist é 422 COM A LISTA (D67/D71), e não uma
//      coluna vazia nem um 500.

let api: ApiDeTeste;
let statusDeployableId = '';
let modelId = '';

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusDeployableId = seed.statusDeployableId;

  const fabricanteId = await criarFabricante(api, 'Fabricante do Export');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

/** O corpo como texto, que é o que o Excel vai ler. */
async function baixar(url: string) {
  const resposta = await api.app.inject({ method: 'GET', url, headers: { cookie: api.cookie } });
  return {
    status: resposta.statusCode,
    headers: resposta.headers,
    texto: resposta.body,
    linhas: resposta.body.split('\r\n').filter(Boolean),
  };
}

describe('GET /api/assets/export', () => {
  it('começa com o BOM (EF BB BF) e declara utf-8', async () => {
    await criarAtivo(api, { statusId: statusDeployableId, modelId, name: 'Notebook do BOM' });

    const { status, headers, texto } = await baixar('/api/assets/export');

    expect(status).toBe(200);
    expect(headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(Buffer.from(texto, 'utf8').subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(String(headers['content-disposition'])).toContain('attachment');
  });

  it('o cabeçalho sai no delimitador configurado e com os títulos em português', async () => {
    const { linhas } = await baixar('/api/assets/export');
    const cabecalho = linhas[0].replace('﻿', '');

    expect(cabecalho.split(';')[0]).toBe('Etiqueta');
    expect(cabecalho).toContain('Responsável');
    expect(cabecalho).toContain('Custo de compra');
  });

  it('respeita `?columns=`, na ordem pedida', async () => {
    const { linhas } = await baixar('/api/assets/export?columns=serial,assetTag');
    expect(linhas[0].replace('﻿', '')).toBe('Nº de série;Etiqueta');
  });

  it('recusa token fora da allowlist com 422 e devolve a lista dos válidos', async () => {
    const resposta = await api.get<{ error: string; validas?: string[] }>(
      '/api/assets/export?columns=assetTag,purchaseCost%3B%20DROP%20TABLE',
    );

    expect(resposta.status).toBe(422);
    expect(resposta.body.error).toMatch(/Coluna desconhecida/);
    expect(resposta.body.validas).toContain('assetTag');
  });

  it('respeita o filtro da tela: `?statusId=` leva só o que a tela mostraria', async () => {
    const seed = await idsDoSeed();
    const emUso = await criarAtivo(api, { statusId: statusDeployableId, modelId, name: 'Para entregar' });
    await api.post(`/api/assets/${emUso.id}/checkout`, {
      targetType: 'USER',
      targetUserId: api.adminId,
    });

    // Só os disponíveis: o que acabou de ser entregue mudou de status.
    const disponiveis = await baixar(`/api/assets/export?statusId=${statusDeployableId}&columns=assetTag`);
    const etiquetas = disponiveis.linhas.slice(1);

    expect(etiquetas).not.toContain(emUso.assetTag);
    expect(seed.statusDeployableId).toBe(statusDeployableId);
  });

  it('a busca da tela também vale no arquivo', async () => {
    const achavel = await criarAtivo(api, {
      statusId: statusDeployableId, modelId, name: 'Palavra-Rarissima-Export',
    });

    const { linhas } = await baixar('/api/assets/export?q=Palavra-Rarissima&columns=assetTag,name');

    expect(linhas.length).toBe(2);
    expect(linhas[1]).toBe(`${achavel.assetTag};Palavra-Rarissima-Export`);
  });

  it('o responsável resolvido sai numa célula, com o posto e o turno', async () => {
    const cenario = await cenarioDePosse(api, ' (export)');
    await api.post(`/api/locations/${cenario.mesa1}/occupants`, {
      userId: cenario.laura, shift: 'manhã',
    });
    await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: cenario.mesa1,
    });

    const { linhas } = await baixar('/api/assets/export?columns=assetTag,responsible');
    const linhaDoAtivo = linhas.find((l) => l.startsWith(cenario.ativo.assetTag));

    // A célula vai entre aspas porque o texto tem `;` dentro — e tem `;` porque
    // num posto com duas pessoas as DUAS respondem (Camada 3).
    expect(linhaDoAtivo).toContain('Laura Souza (export) (Mesa 1 (export), manhã)');
  });

  it('recusa `page` e `perPage`: exportar não pagina', async () => {
    const comPagina = await api.get('/api/assets/export?page=2');
    const comPerPage = await api.get('/api/assets/export?perPage=10');

    expect([comPagina.status, comPerPage.status]).toEqual([422, 422]);
  });

  it('exige sessão', async () => {
    const { status } = await api.anonimo.get('/api/assets/export');
    expect(status).toBe(401);
  });
});

describe('GET /api/licenses/export — a quarta porta da chave de produto', () => {
  beforeAll(async () => {
    const seed = await idsDoSeed();
    await criarLicenca(api, {
      name: 'Office do Export',
      categoryId: seed.categoriaLicencaId,
      seatsTotal: 5,
      productKey: 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE',
    });
  });

  it('NÃO escreve a chave de produto em lugar nenhum do arquivo', async () => {
    // Todas as colunas, de propósito: o teste não pode depender de a chave
    // estar fora do conjunto PADRÃO.
    const todas = [
      'name', 'manufacturer', 'category', 'supplier', 'seatsTotal', 'ocupados', 'livres',
      'queimados', 'minSeats', 'status', 'expirationDate', 'terminationDate',
      'licensedToName', 'licensedToEmail', 'orderNumber', 'purchaseDate', 'purchaseCost',
      'hasProductKey', 'reassignable', 'maintained', 'notes',
    ].join(',');

    const { status, texto } = await baixar(`/api/licenses/export?columns=${todas}`);

    expect(status).toBe(200);
    expect(texto).not.toContain('AAAAA-BBBBB');
    // Nem a máscara: decifrar N chaves para escrever quatro caracteres de cada
    // num arquivo é exposição que não paga o que entrega.
    expect(texto).not.toContain('••••');
  });

  it('leva "Tem chave" — que é o que uma planilha de conferência precisa saber', async () => {
    const { linhas } = await baixar('/api/licenses/export?columns=name,hasProductKey');

    expect(linhas[0].replace('﻿', '')).toBe('Licença;Tem chave');
    expect(linhas.some((l) => l.startsWith('Office do Export;true'))).toBe(true);
  });

  it('os assentos derivados saem como número cru', async () => {
    const { linhas } = await baixar('/api/licenses/export?columns=name,seatsTotal,livres');
    const linhaDaLicenca = linhas.find((l) => l.startsWith('Office do Export'));

    expect(linhaDaLicenca).toBe('Office do Export;5;5');
  });

  it('recusa token fora da allowlist com a lista dos válidos', async () => {
    const { status, body } = await api.get<{ validas?: string[] }>(
      '/api/licenses/export?columns=productKey',
    );

    expect(status).toBe(422);
    expect(body.validas).toContain('hasProductKey');
    expect(body.validas).not.toContain('productKey');
  });
});

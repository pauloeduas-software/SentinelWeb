import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  comporConjunto, criarAtivo, criarCampo, criarConjunto, criarFabricante, criarModelo,
  idsDoSeed, pendurarConjunto,
} from '../helpers/fixtures';
import { corpoMultipart } from '../helpers/multipart';

// CAMPO CUSTOMIZADO NO CSV — export e import (o item da F9 que esperava a F10).
//
// ═════════════════════════════════════════════════════════════════════════════
// O ITEM FICOU PENDENTE POR UM MOTIVO ESCRITO NO TODO: *"anotar a coluna sem o
// CSV existir seria escrever metade de uma feature"*. A F10 construiu o export e o
// importador; esta é a outra metade.
//
// E ELA TEM UMA REGRA QUE NÃO É SIMÉTRICA: o campo CIFRADO não sai e não entra.
//
//   no EXPORT  mascarar daria uma coluna de `••••••` repetido — inútil —, e
//              exportar o pacote `enc:v1:…` seria o segredo saindo do banco num
//              arquivo que circula por e-mail;
//   no IMPORT  uma planilha com a senha da BIOS de trezentas máquinas em texto é a
//              pior forma possível de carregar segredo, e o caminho certo já
//              existe: o campo no formulário, um por vez, cifrado na gravação.
//
// As duas recusas são 422 com o NOME do campo — não "coluna desconhecida": quem
// pediu precisa ouvir que aquele campo não vai para planilha, não que ele não
// existe.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let statusDeployableId = '';
let modelId = '';
let modeloNome = '';
let campoComum: { id: string; slug: string };
let campoCifrado: { id: string; slug: string };
let ativoId = '';

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusDeployableId = seed.statusDeployableId;

  const fabricanteId = await criarFabricante(api, 'Fabricante do CSV de campos');
  modeloNome = 'Modelo do CSV de campos';
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId, name: modeloNome });

  campoComum = await criarCampo(api, { name: 'Centro de custo', slug: 'centro_de_custo' });
  campoCifrado = await criarCampo(api, {
    name: 'Senha do BIOS CSV', slug: 'senha_bios_csv', encrypted: true,
  });

  const conjunto = await criarConjunto(api, 'Conjunto do CSV');
  await comporConjunto(api, conjunto, [{ fieldId: campoComum.id }, { fieldId: campoCifrado.id }]);
  await pendurarConjunto(api, { modelId }, conjunto);

  const ativo = await criarAtivo(api, {
    assetTag: 'ATV-CSV-CF-1', statusId: statusDeployableId, modelId,
  });
  ativoId = ativo.id;

  // Os dois valores pelo caminho do FORMULÁRIO: é ele que cifra o segundo.
  const gravou = await api.put(`/api/assets/${ativoId}`, {
    customFields: { centro_de_custo: 'CC-4100', senha_bios_csv: 'S3nh4-do-BIOS' },
  });
  expect(gravou.status).toBe(200);
});

afterAll(async () => { await api.fechar(); });

/** O corpo como texto, que é o que o Excel vai ler. */
async function baixar(url: string) {
  const resposta = await api.app.inject({ method: 'GET', url, headers: { cookie: api.cookie } });
  return {
    status: resposta.statusCode,
    body: resposta.body,
    linhas: resposta.body.split('\r\n').filter(Boolean),
    erro: (() => {
      try { return (JSON.parse(resposta.body) as { error?: string }).error ?? null; } catch { return null; }
    })(),
  };
}

describe('o export', () => {
  it('a coluna `cf:<slug>` sai com o NOME do campo no cabeçalho e o valor na linha', async () => {
    const csv = await baixar('/api/assets/export?columns=assetTag,cf:centro_de_custo');

    expect(csv.status).toBe(200);
    // O TÍTULO É O NOME, não o slug: quem abre a planilha lê "Centro de custo", e
    // `centro_de_custo` é vocabulário de banco.
    expect(csv.linhas[0]).toContain('Centro de custo');
    expect(csv.linhas[0]).not.toContain('centro_de_custo');

    const linha = csv.linhas.find((texto) => texto.startsWith('ATV-CSV-CF-1'));
    expect(linha).toBeDefined();
    expect(linha).toContain('CC-4100');
  });

  it('ativo SEM valor sai com a célula vazia, não com `null`', async () => {
    const outro = await criarAtivo(api, {
      assetTag: 'ATV-CSV-CF-2', statusId: statusDeployableId, modelId,
    });
    expect(outro.id).toBeTruthy();

    const csv = await baixar('/api/assets/export?columns=assetTag,cf:centro_de_custo');
    const linha = csv.linhas.find((texto) => texto.startsWith('ATV-CSV-CF-2'));

    // `ATV-CSV-CF-2;` e nada depois. Um "null" na célula seria lido como texto
    // pelo Excel e voltaria pelo importador como o valor literal "null".
    expect(linha).toBe('ATV-CSV-CF-2;');
  });

  it('o campo CIFRADO é recusado com 422 que diz o motivo — não "coluna desconhecida"', async () => {
    const csv = await baixar('/api/assets/export?columns=assetTag,cf:senha_bios_csv');

    expect(csv.status).toBe(422);
    expect(csv.erro).toMatch(/cifrado/i);
    // O NOME do campo na frase: quem montou a URL precisa saber QUAL dos cinco
    // campos foi recusado.
    expect(csv.erro).toContain('Senha do BIOS CSV');
  });

  it('e o pacote cifrado NÃO aparece em nenhuma coluna do arquivo', async () => {
    // A varredura que fecha o caso: mesmo pedindo todas as colunas conhecidas, o
    // `enc:v1:` não sai. Ele é o segredo cifrado — sair num arquivo que circula por
    // e-mail é a porta dos fundos que o D77 nomeia.
    const csv = await baixar('/api/assets/export?columns=assetTag,cf:centro_de_custo,notes');

    expect(csv.status).toBe(200);
    expect(csv.body).not.toContain('enc:v1:');
    expect(csv.body).not.toContain('S3nh4-do-BIOS');
  });

  it('slug inexistente é 422 com a lista — e a lista INCLUI os tokens `cf:`', async () => {
    const csv = await baixar('/api/assets/export?columns=assetTag,cf:nao_existe');

    expect(csv.status).toBe(422);
    expect(csv.erro).toMatch(/Coluna desconhecida/);
    // Sem isto, quem erra um slug recebe uma lista que não menciona campo
    // customizado nenhum e conclui que o export não os suporta.
    expect(csv.erro).toContain('cf:centro_de_custo');
  });

  it('o export PADRÃO não traz campo customizado nenhum', async () => {
    const csv = await baixar('/api/assets/export');

    expect(csv.status).toBe(200);
    // Opt-in: as onze colunas padrão respondem "o que é, de quem é e quanto
    // custou". Campo customizado é do cliente e pode ser qualquer coisa — entrar
    // sozinho no arquivo de todo mundo mudaria o formato que a F10 publicou.
    expect(csv.linhas[0]).not.toContain('Centro de custo');
  });
});

describe('o mapeamento do import', () => {
  it('`/api/imports/fields` oferece o campo comum e NÃO o cifrado', async () => {
    const resposta = await api.get<{ campos: { token: string; rotulo: string }[] }>(
      '/api/imports/fields?target=ASSETS',
    );

    expect(resposta.status).toBe(200);
    const tokens = resposta.body.campos.map((campo) => campo.token);
    expect(tokens).toContain('cf:centro_de_custo');
    expect(tokens).not.toContain('cf:senha_bios_csv');
  });

  it('e não oferece campo customizado em PESSOAS — a coluna não existe lá', async () => {
    const resposta = await api.get<{ campos: { token: string }[] }>('/api/imports/fields?target=USERS');

    const tokens = resposta.body.campos.map((campo) => campo.token);
    // Só o ativo tem `customFields` (F9). Oferecer o token aqui seria oferecer um
    // mapeamento que o adaptador ignora em silêncio.
    expect(tokens.every((token) => !token.startsWith('cf:'))).toBe(true);
  });
});

describe('o import', () => {
  async function subir(csv: string, colunas: Record<string, string>) {
    const { payload, headers } = corpoMultipart(
      'ativos.csv',
      'text/csv',
      Buffer.from(csv, 'utf8'),
      { target: 'ASSETS', mapping: JSON.stringify({ chave: 'assetTag', colunas }) },
    );

    const resposta = await api.app.inject({
      method: 'POST', url: '/api/imports', headers: { ...headers, cookie: api.cookie }, payload,
    });
    return {
      status: resposta.statusCode,
      body: JSON.parse(resposta.body || '{}') as { id: string; ok: number; erro: number; error?: string },
    };
  }

  it('grava o valor do campo customizado numa criação', async () => {
    const simulado = await subir(
      `Etiqueta;Modelo;Centro\r\nATV-CSV-IMP-1;${modeloNome};CC-9000\r\n`,
      { Etiqueta: 'assetTag', Modelo: 'model', Centro: 'cf:centro_de_custo' },
    );
    expect(simulado.status).toBe(201);
    expect(simulado.body.ok).toBe(1);

    const aplicado = await api.post(`/api/imports/${simulado.body.id}/apply`);
    expect(aplicado.status).toBe(200);

    const ativo = await prisma.asset.findFirstOrThrow({
      where: { assetTag: 'ATV-CSV-IMP-1' },
      select: { customFields: true },
    });
    expect(ativo.customFields).toMatchObject({ centro_de_custo: 'CC-9000' });
  });

  it('atualiza o valor de um ativo que já existe', async () => {
    const simulado = await subir(
      `Etiqueta;Centro\r\nATV-CSV-CF-1;CC-NOVO\r\n`,
      { Etiqueta: 'assetTag', Centro: 'cf:centro_de_custo' },
    );
    expect(simulado.body.ok).toBe(1);
    expect((await api.post(`/api/imports/${simulado.body.id}/apply`)).status).toBe(200);

    const ativo = await prisma.asset.findUniqueOrThrow({
      where: { id: ativoId }, select: { customFields: true },
    });
    const campos = ativo.customFields as Record<string, string>;

    expect(campos.centro_de_custo).toBe('CC-NOVO');
    // E O CIFRADO CONTINUA LÁ, intacto: o import mandou UM campo, e os outros não
    // são tocados. Um `{}` enviado sempre apagaria os campos de todo ativo
    // atualizado por uma planilha que nem fala deles.
    expect(campos.senha_bios_csv.startsWith('enc:v1:')).toBe(true);
  });

  it('o formato do campo é validado pelo MESMO motor do formulário', async () => {
    const campoIp = await criarCampo(api, {
      name: 'IP fixo do CSV', slug: 'ip_fixo_csv', format: 'IPV4',
    });
    const conjunto = await criarConjunto(api, 'Conjunto do IP no CSV');
    await comporConjunto(api, conjunto, [{ fieldId: campoIp.id }]);

    const fabricanteId = await criarFabricante(api, 'Fabricante do IP no CSV');
    const modeloIp = await criarModelo(api, {
      categoriaId: (await idsDoSeed()).categoriaId, fabricanteId, name: 'Modelo do IP no CSV',
    });
    await pendurarConjunto(api, { modelId: modeloIp }, conjunto);

    const simulado = await subir(
      `Etiqueta;Modelo;IP\r\nATV-CSV-IMP-IP;Modelo do IP no CSV;nao-e-um-ip\r\n`,
      { Etiqueta: 'assetTag', Modelo: 'model', IP: 'cf:ip_fixo_csv' },
    );

    // A linha é RECUSADA na simulação — e a regra não foi reescrita no importador:
    // o adaptador monta `customFields` e entrega ao `createAsset`, que chama o
    // mesmo `validarCamposCustomizados()` do formulário. Uma validação própria aqui
    // seria uma segunda regra para IP, MAC e regex.
    expect(simulado.status).toBe(201);
    expect(simulado.body.erro).toBe(1);
    expect(simulado.body.ok).toBe(0);
  });

  it('mapear o campo CIFRADO é 422 na subida', async () => {
    const recusado = await subir(
      `Etiqueta;Senha\r\nATV-CSV-CF-1;qualquer\r\n`,
      { Etiqueta: 'assetTag', Senha: 'cf:senha_bios_csv' },
    );

    expect(recusado.status).toBe(422);
    expect(recusado.body.error).toMatch(/desconhecido/i);
  });

  it('slug inexistente também é 422', async () => {
    const recusado = await subir(
      `Etiqueta;X\r\nATV-CSV-CF-1;qualquer\r\n`,
      { Etiqueta: 'assetTag', X: 'cf:nao_existe' },
    );
    expect(recusado.status).toBe(422);
  });
});

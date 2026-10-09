import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { PDF_MINIMO, PNG_1x1, corpoMultipart } from '../helpers/multipart';

// A CONFIGURAÇÃO DE SISTEMA (F10, Etapa A) — e as três coisas que ela não faz.
//
// 1. NÃO devolve o singleton inteiro. `cryptoCanary` é texto conhecido cifrado:
//    quem o tem pode atacar a chave offline, sem tocar no servidor. E
//    `assetTagNext` não é configuração — é um contador consumido dentro da
//    transação que cria o ativo (quem o espia usa `/settings/next-asset-tag`,
//    que não consome).
// 2. NÃO aceita `logoPath` no corpo do `PUT`. O caminho de um arquivo é escrito
//    por quem gravou o arquivo; aceito por JSON, ele deixaria qualquer cliente
//    apontar a logo para um caminho arbitrário dentro do `UPLOAD_DIR` — e a
//    rota que serve a imagem leria esse caminho.
// 3. NÃO expõe o backup. Com `BACKUP_ENABLED` desligado — que é o padrão e o
//    que o `.env.test` tem — as rotas nem são registradas: a resposta é 404, de
//    rota inexistente, e não um 403 que confirma que o recurso existe.

interface ConfiguracaoDoSistema {
  companyName: string;
  logoPath: string | null;
  faviconPath: string | null;
  primaryColor: string;
  locale: string;
  dateFormat: string;
  currency: string;
  csvDelimiter: string;
}

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

describe('GET /api/settings', () => {
  it('devolve o recorte de sistema, com os padrões do schema', async () => {
    const { status, body } = await api.get<ConfiguracaoDoSistema>('/api/settings');

    expect(status).toBe(200);
    expect(body.locale).toBe('pt-BR');
    expect(body.currency).toBe('BRL');
    expect(body.csvDelimiter).toBe(';');
    expect(body.dateFormat).toBe('DD/MM/YYYY');
  });

  it('não leva o canário da cifra nem o contador de etiquetas para o navegador', async () => {
    const { body } = await api.get<Record<string, unknown>>('/api/settings');

    expect(body).not.toHaveProperty('cryptoCanary');
    expect(body).not.toHaveProperty('assetTagNext');
    expect(body).not.toHaveProperty('assetTagPrefix');
    // Nem os dois recortes vizinhos: cada tela pede o seu.
    expect(body).not.toHaveProperty('discoveryMode');
    expect(body).not.toHaveProperty('alertEmails');
  });

  it('exige sessão', async () => {
    const { status } = await api.anonimo.get('/api/settings');
    expect(status).toBe(401);
  });
});

describe('PUT /api/settings', () => {
  it('salva um campo de cada vez, sem exigir os outros', async () => {
    const { status, body } = await api.put<ConfiguracaoDoSistema>('/api/settings', {
      companyName: 'Pentagoni TI',
    });

    expect(status).toBe(200);
    expect(body.companyName).toBe('Pentagoni TI');
    // O resto continua no padrão: um `PUT` parcial não zera vizinho.
    expect(body.currency).toBe('BRL');
  });

  it('normaliza a moeda para maiúsculas', async () => {
    const { body } = await api.put<ConfiguracaoDoSistema>('/api/settings', { currency: 'usd' });
    expect(body.currency).toBe('USD');
  });

  it('recusa idioma que o Intl não conhece', async () => {
    // A razão não é purismo: a TELA chama `toLocaleString(locale)`, e um locale
    // inválido lança `RangeError` — a lista de ativos ficaria em branco em vez
    // de mostrar número formatado errado.
    const { status, body } = await api.put<{ fields?: Record<string, string> }>('/api/settings', {
      locale: 'não-existe',
    });

    expect(status).toBe(422);
    expect(body.fields?.locale).toMatch(/idioma/i);
  });

  it('recusa moeda desconhecida, formato de data fora da lista e delimitador inventado', async () => {
    const moeda = await api.put('/api/settings', { currency: 'XQZ' });
    const data = await api.put('/api/settings', { dateFormat: 'DD.MM.YY' });
    const delimitador = await api.put('/api/settings', { csvDelimiter: '::' });

    expect([moeda.status, data.status, delimitador.status]).toEqual([422, 422, 422]);
  });

  it('recusa cor fora de #rrggbb', async () => {
    const { status, body } = await api.put<{ fields?: Record<string, string> }>('/api/settings', {
      primaryColor: 'vermelho',
    });

    expect(status).toBe(422);
    expect(body.fields?.primaryColor).toMatch(/#rrggbb/);
  });


  it('recusa `logoPath` no corpo: caminho de arquivo não se escreve por JSON', async () => {
    const { status, body } = await api.put<{ fields?: Record<string, string> }>('/api/settings', {
      logoPath: '../../etc/passwd',
    });

    expect(status).toBe(422);
    expect(body.fields?.logoPath).toMatch(/não reconhecido/);
  });
});

async function subirMarca(
  marca: string,
  nome = 'logo.png',
  tipo = 'image/png',
  bytes = PNG_1x1,
  comSessao = true,
) {
  const { payload, headers } = corpoMultipart(nome, tipo, bytes);
  const resposta = await api.app.inject({
    method: 'PUT',
    url: `/api/settings/branding/${marca}`,
    headers: comSessao ? { ...headers, cookie: api.cookie } : headers,
    payload,
  });
  return { status: resposta.statusCode, body: JSON.parse(resposta.body || '{}') as ConfiguracaoDoSistema };
}

describe('A marca — logo e favicon', () => {
  it('exige sessão para subir', async () => {
    const { status } = await subirMarca('logo', 'logo.png', 'image/png', PNG_1x1, false);
    expect(status).toBe(401);
  });

  it('sobe a logo, grava o caminho relativo e serve o arquivo', async () => {
    const upload = await subirMarca('logo');

    expect(upload.status).toBe(200);
    // Caminho RELATIVO ao `UPLOAD_DIR`, com a pasta de imagens na frente — e um
    // nome que nós geramos, não o que o cliente mandou.
    expect(upload.body.logoPath).toMatch(/^imagens\/[0-9a-f-]+\.png$/);

    const arquivo = await api.get('/api/settings/branding/logo');
    expect(arquivo.status).toBe(200);
    expect(arquivo.headers['content-type']).toBe('image/png');
    // Resposta que passou por sessão não pode ficar em cache compartilhado.
    expect(String(arquivo.headers['cache-control'])).toContain('no-store');
  });

  it('a segunda logo substitui a primeira, e o arquivo antigo sai do disco', async () => {
    const primeira = await subirMarca('logo');
    const segunda = await subirMarca('logo');

    expect(segunda.body.logoPath).not.toBe(primeira.body.logoPath);

    // O caminho antigo não responde mais por rota nenhuma: a coluna aponta para
    // o novo, e o arquivo anterior foi apagado depois da troca.
    const { existe } = await import('../../server/core/storage/storage');
    expect(await existe(primeira.body.logoPath!)).toBe(false);
    expect(await existe(segunda.body.logoPath!)).toBe(true);
  });

  it('favicon é coluna própria: subir um não mexe no outro', async () => {
    const logo = await subirMarca('logo');
    const favicon = await subirMarca('favicon', 'favicon.png');

    expect(favicon.body.faviconPath).toMatch(/^imagens\//);
    expect(favicon.body.logoPath).toBe(logo.body.logoPath);
  });

  it('recusa PDF: `<img src>` não desenha PDF', async () => {
    const { status, body } = await subirMarca('logo', 'marca.pdf', 'application/pdf', PDF_MINIMO);
    expect(status).toBe(422);
    expect((body as unknown as { error: string }).error).toMatch(/imagem/i);
  });

  it('recusa marca fora da allowlist', async () => {
    const { status } = await subirMarca('rodape');
    expect(status).toBe(422);
  });

  it('apagar devolve a coluna para nulo, e a rota passa a responder 404', async () => {
    await subirMarca('logo');

    const apagou = await api.delete<ConfiguracaoDoSistema>('/api/settings/branding/logo');
    expect(apagou.status).toBe(200);
    expect(apagou.body.logoPath).toBeNull();

    const arquivo = await api.get('/api/settings/branding/logo');
    expect(arquivo.status).toBe(404);
  });
});

describe('O backup, com BACKUP_ENABLED desligado', () => {
  it('não registra rota nenhuma: a listagem responde 404, não 403', async () => {
    const { status } = await api.get('/api/backups');
    expect(status).toBe(404);
  });

  it('nem a criação, nem o download, nem o expurgo existem', async () => {
    const criar = await api.post('/api/backups');
    const baixar = await api.get('/api/backups/sentinel-20261001-120000.dump/download');
    const expurgo = await api.post('/api/backups/prune');

    expect([criar.status, baixar.status, expurgo.status]).toEqual([404, 404, 404]);
  });
});

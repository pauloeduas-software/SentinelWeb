import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// A CONFIGURAÇÃO DE SISTEMA (F10, Etapa A) — e o que ela não devolve.
//
// NÃO devolve o singleton inteiro: `assetTagNext` não é configuração — é um
// contador consumido dentro da transação que cria o ativo (quem o espia usa
// `/settings/next-asset-tag`, que não consome).

interface ConfiguracaoDoSistema {
  locale: string;
  dateFormat: string;
  currency: string;
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
    expect(body.dateFormat).toBe('DD/MM/YYYY');
  });

  it('não leva o canário da cifra nem o contador de etiquetas para o navegador', async () => {
    const { body } = await api.get<Record<string, unknown>>('/api/settings');

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
      locale: 'pt-PT',
    });

    expect(status).toBe(200);
    expect(body.locale).toBe('pt-PT');
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

  it('recusa moeda desconhecida e formato de data fora da lista', async () => {
    const moeda = await api.put('/api/settings', { currency: 'XQZ' });
    const data = await api.put('/api/settings', { dateFormat: 'DD.MM.YY' });
    expect([moeda.status, data.status]).toEqual([422, 422]);
  });

});

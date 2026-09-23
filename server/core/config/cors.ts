import { isProduction } from './env';

// Origens permitidas do frontend (CORS).
//
// O padrão do projeto é MESMA ORIGEM nas duas pontas: em desenvolvimento o Vite
// faz proxy de /api e /agent-hub para o backend (ver vite.config.ts) e em
// produção o próprio Fastify serve o dist. Logo, sem CORS_ORIGIN:
//   - desenvolvimento: reflete a origem da requisição (ferramenta, outro host da LAN);
//   - produção: nenhuma origem externa — o painel é servido junto e não precisa.
//
// CORS_ORIGIN aceita uma ou várias origens separadas por vírgula, para o caso de
// front e back em hosts diferentes. `*` é recusado: liberar qualquer origem em
// produção é vetor de ataque.
export type CorsOrigin = string[] | boolean;

let cachedOrigins: CorsOrigin | null = null;

export function getCorsOrigins(): CorsOrigin {
  if (cachedOrigins !== null) return cachedOrigins;

  const raw = process.env.CORS_ORIGIN?.replace(/^"|"$/g, '');
  const entries = (raw ?? '').split(',').map(entry => entry.trim()).filter(Boolean);

  if (entries.includes('*')) {
    throw new Error(
      'CORS_ORIGIN="*" não é aceito. Deixe a variável vazia (mesma origem) ou informe a origem exata do frontend, ex.: CORS_ORIGIN="https://painel.suaempresa.com"',
    );
  }

  if (entries.length === 0) {
    cachedOrigins = !isProduction;
    return cachedOrigins;
  }

  // Normaliza para o formato que o navegador envia no header Origin (esquema +
  // host + porta, sem barra final nem path): "https://app.com/" com barra nunca
  // casaria e o CORS quebraria em silêncio.
  cachedOrigins = entries.map((entry) => {
    try {
      const url = new URL(entry);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocolo inválido');
      return url.origin;
    } catch {
      throw new Error(`CORS_ORIGIN inválida: "${entry}". Use a origem completa, ex.: "https://painel.suaempresa.com"`);
    }
  });

  return cachedOrigins;
}

/**
 * Esta origem é uma das nossas?
 *
 * Existe para a checagem de `Origin` das rotas de autenticação
 * (`auth-hardening.helper.ts`), que é anti-CSRF e NÃO é CORS — por isso mora
 * aqui, ao lado da lista, mas é consultada por outro caminho.
 *
 * `true` (desenvolvimento sem `CORS_ORIGIN`) responde `true` para qualquer
 * origem: é o mesmo "reflete quem chamou" que o CORS aplica ali, e endurecer só
 * este ponto faria o painel da 3000 parar de logar na API da 3001 — o atrito
 * sem ganho que a configuração padrão existe para evitar. `false` (produção sem
 * a variável, ou seja, mesma origem) recusa toda origem cruzada, que é
 * exatamente a intenção.
 */
export function origemPermitida(origin: string): boolean {
  const origens = getCorsOrigins();
  if (typeof origens === 'boolean') return origens;
  return origens.includes(origin);
}

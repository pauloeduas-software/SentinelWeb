import axios from 'axios';

/**
 * Cliente HTTP único do painel.
 *
 * - Em dev o Vite faz proxy de /api para a porta do backend (ver vite.config.ts),
 *   então o frontend não precisa saber em que porta o Fastify subiu.
 * - Em produção o próprio Fastify serve o frontend, logo /api é same-origin.
 * - VITE_API_URL cobre o caso de frontend e backend em hosts diferentes.
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// O backend responde erro SEMPRE no mesmo formato (`{ error: "mensagem" }`, ver
// server/core/errors). Traduzir isso em Error acontece aqui, num lugar só: as
// telas mostram `error.message` sem cada uma precisar conhecer o formato da
// resposta nem tratar "servidor fora do ar" por conta própria.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const fromServer = error?.response?.data?.error;
    const message =
      typeof fromServer === 'string' && fromServer
        ? fromServer
        : error?.code === 'ECONNABORTED'
          ? 'O servidor demorou demais para responder.'
          : error?.response
            ? 'Erro inesperado no servidor.'
            : 'Não foi possível falar com o servidor.';

    return Promise.reject(new Error(message, { cause: error }));
  },
);

import type { RouteShorthandOptions } from 'fastify';

// Teto por IP das rotas de ESCRITA, mais apertado que o global de 300/min.
//
// Criar, editar e apagar são ações humanas: 40 por minuto já é muito para quem
// está preenchendo formulário, e é pouco para quem está varrendo a API. O
// comando RMM (desligar/reiniciar máquina) fica ainda mais baixo — é destrutivo.
export const WRITE_RATE_LIMIT: RouteShorthandOptions = {
  config: { rateLimit: { max: 40, timeWindow: '1 minute' } },
};

export const DESTRUCTIVE_RATE_LIMIT: RouteShorthandOptions = {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
};

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

// O login tem teto próprio porque é a única rota onde a repetição É o ataque.
//
// 20/min por IP trabalha junto com o bloqueio por conta (5 erros travam a conta
// por 15 minutos, ver login.usecase.ts): a trava defende UMA conta conhecida, o
// teto por IP defende a LISTA inteira — sem ele, o atacante troca de usuário a
// cada tentativa e nunca trava nada. Quem erra a senha de verdade não chega
// perto de 20 em um minuto.
export const LOGIN_RATE_LIMIT: RouteShorthandOptions = {
  config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
};

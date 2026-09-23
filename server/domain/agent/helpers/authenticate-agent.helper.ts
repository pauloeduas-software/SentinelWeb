import { timingSafeEqual } from 'crypto';
import { getAgentToken } from '../../../core/config/env';
import { createLogger } from '../../../core/logger/logger';
import {
  authenticateApiToken, type TokenAutenticado,
} from '../../auth/use-cases/authenticate-api-token.usecase';

// Autenticação do Agente Sentinel (C#) no /agent-hub.
//
// O token vai no header `Authorization: Bearer <token>`, não na query string:
// header é o que o `core/logger` já oculta (logger.ts, `redact`) e o que o
// `ClientWebSocket.Options.SetRequestHeader` do C# envia sem esforço.
//
// DOIS CAMINHOS CONVIVEM, e isso tem prazo (D89):
//
//   1. `ApiToken` por agente  — o certo, com prefixo, hash, revogação e vínculo
//                               com a máquina;
//   2. `AGENT_TOKEN` compartilhado — o da F0, que tirou a porta aberta do ar.
//
// POR QUE NÃO UM CORTE SECO: o agente é um binário C# que NÃO está neste
// repositório e roda em máquinas que ninguém desliga para atualizar em bloco.
// Cortar o token compartilhado num deploy derruba a frota inteira e — pior —
// derruba o canal por onde se descobriria que ela caiu: quem não conecta não
// reporta.
//
// O LOG DE DEPRECIAÇÃO É A PARTE QUE NÃO PODE FALTAR. Sem ele a convivência
// vira permanente por esquecimento: o token compartilhado fica no `.env` por
// mais um ano e a fase é dada como concluída. Com ele, "já dá para cortar?" tem
// resposta observável — quando o log parar de aparecer, o caminho 2 sai, num
// commit só, deliberado.

const logger = createLogger('agent.auth');

function equalsSeguro(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  // `timingSafeEqual` exige o mesmo tamanho — e o próprio tamanho não é segredo.
  if (bufferA.length !== bufferB.length) return false;

  // Comparação em tempo constante: `===` sai no primeiro byte diferente, o que
  // permite descobrir o token byte a byte medindo o tempo de resposta.
  return timingSafeEqual(bufferA, bufferB);
}

/** Como a conexão se autenticou — é o que decide se há vínculo a manter. */
export type FormaDeAutenticacao =
  | { via: 'API_TOKEN'; token: TokenAutenticado }
  | { via: 'COMPARTILHADO' }
  | null;

function extrairBearer(header: string | undefined): string | null {
  const prefixo = 'Bearer ';
  if (!header?.startsWith(prefixo)) return null;

  const token = header.slice(prefixo.length).trim();
  return token || null;
}

/**
 * Autentica a conexão do agente.
 *
 * A ORDEM IMPORTA: o `ApiToken` é tentado PRIMEIRO. Um token que tenha a forma
 * `sw_xxxx.segredo` e não bata na tabela é recusado — não cai no compartilhado.
 * Sem isso, um token revogado voltaria a funcionar se por acaso fosse igual ao
 * `AGENT_TOKEN`, e revogar deixaria de significar alguma coisa.
 */
export async function autenticarAgente(
  authorizationHeader: string | undefined,
  ip: string,
): Promise<FormaDeAutenticacao> {
  const bruto = extrairBearer(authorizationHeader);

  if (bruto) {
    const token = await authenticateApiToken(bruto, 'AGENT');
    if (token) return { via: 'API_TOKEN', token };
  }

  const compartilhado = getAgentToken();

  // Sem AGENT_TOKEN configurado, libera — situação que `validateEnv()` só
  // tolera fora de produção, onde ela derruba o boot.
  if (!compartilhado) return { via: 'COMPARTILHADO' };

  if (bruto && equalsSeguro(bruto, compartilhado)) {
    logger.warn(
      `[Agent] DEPRECIADO: conexão de ${ip} usou o AGENT_TOKEN compartilhado. ` +
        'Emita um ApiToken por agente (D89) — este caminho será removido.',
    );
    return { via: 'COMPARTILHADO' };
  }

  return null;
}

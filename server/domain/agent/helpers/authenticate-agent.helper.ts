import { timingSafeEqual } from 'crypto';
import { getAgentToken } from '../../../core/config/env';

// Autenticação do Agente Sentinel (C#) no /agent-hub.
//
// O token vai no header `Authorization: Bearer <token>`, não na query string:
// header é o que o `core/logger` já oculta (logger.ts, `redact`) e o que o
// `ClientWebSocket.Options.SetRequestHeader` do C# envia sem esforço.

function equalsSeguro(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  // `timingSafeEqual` exige o mesmo tamanho — e o próprio tamanho não é segredo.
  if (bufferA.length !== bufferB.length) return false;

  // Comparação em tempo constante: `===` sai no primeiro byte diferente, o que
  // permite descobrir o token byte a byte medindo o tempo de resposta.
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * `true` quando a conexão pode prosseguir.
 *
 * Sem AGENT_TOKEN configurado, libera — situação que `validateEnv()` só tolera
 * fora de produção, onde ela derruba o boot.
 */
export function isAgentAuthorized(authorizationHeader: string | undefined): boolean {
  const esperado = getAgentToken();
  if (!esperado) return true;

  const prefixo = 'Bearer ';
  if (!authorizationHeader?.startsWith(prefixo)) return false;

  return equalsSeguro(authorizationHeader.slice(prefixo.length).trim(), esperado);
}

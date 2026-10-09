import { timingSafeEqual } from 'crypto';
import { getAgentToken } from '../../../core/config/env';

// Autenticação do Agente Sentinel (C#) no /agent-hub.
//
// O token vai no header `Authorization: Bearer <token>`, não na query string:
// header é o que o `core/logger` já oculta (logger.ts, `redact`) e o que o
// `ClientWebSocket.Options.SetRequestHeader` do C# envia sem esforço.
//
// UM CAMINHO SÓ: o `AGENT_TOKEN` compartilhado, do `.env`.
//
// ERAM DOIS (D89): um `ApiToken` por agente — com prefixo, hash, revogação e
// vínculo com a máquina — convivendo com o compartilhado por prazo, até a frota
// migrar. O D149 encerrou o prazo sem cumpri-lo: o `ApiToken` saiu com o
// de-escopo, porque revogar token por agente é problema de frota de verdade e
// aqui o agente da demonstração é um.
//
// O QUE ISSO CUSTA, declarado: o segredo é o mesmo para todas as máquinas, e
// trocá-lo exige reconfigurar o agente em cada uma. É o estado da F0, e é
// aceitável no escopo do D143 pelo mesmo motivo que o SSO saiu.

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
 * Como a conexão se autenticou.
 *
 * Continua sendo um objeto, e não um booleano, porque o `agent.maestro` ramifica
 * sobre ele — e porque um dia pode voltar a ter mais de uma forma.
 */
export type FormaDeAutenticacao = { via: 'COMPARTILHADO' } | null;

function extrairBearer(header: string | undefined): string | null {
  const prefixo = 'Bearer ';
  if (!header?.startsWith(prefixo)) return null;

  const token = header.slice(prefixo.length).trim();
  return token || null;
}

/** Autentica a conexão do agente pelo `AGENT_TOKEN`. */
export async function autenticarAgente(
  authorizationHeader: string | undefined,
): Promise<FormaDeAutenticacao> {
  const bruto = extrairBearer(authorizationHeader);
  const compartilhado = getAgentToken();

  // Sem AGENT_TOKEN configurado, libera — situação que `validateEnv()` só
  // tolera fora de produção, onde ela derruba o boot.
  if (!compartilhado) return { via: 'COMPARTILHADO' };

  if (bruto && equalsSeguro(bruto, compartilhado)) return { via: 'COMPARTILHADO' };

  return null;
}

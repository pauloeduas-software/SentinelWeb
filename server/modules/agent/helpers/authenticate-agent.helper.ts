import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from '../../../infra/database/prismaClient';
import { getAgentEnrollSecret } from '../../../infra/config/env';

// Autenticação do SentinelAgente (CR). Dois segredos, cada um numa porta:
//
//   o SEGREDO DE INSTALAÇÃO (`AGENT_ENROLL_SECRET`), um só para a frota, vale
//   só em `POST /agent-hub/enroll`. Quem instala o agente o entrega, e o agente o
//   apaga quando o cadastro dá certo.
//
//   o TOKEN DA MÁQUINA, que o cadastro devolve, é o único que o `/agent-hub`
//   aceita. Ele diz QUAL máquina está do outro lado: a conexão fica presa ao HWID
//   dele, e a mensagem com outro HWID fecha a conexão com 1008.
//
// Os dois vão no header `Authorization: Bearer <…>`, não na query string: header
// é o que o `infra/logger` já oculta (logger.ts, `redact`), e todo cliente
// WebSocket sabe mandar header na abertura da conexão.

function equalsSeguro(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  // `timingSafeEqual` exige o mesmo tamanho — e o próprio tamanho não é segredo.
  if (bufferA.length !== bufferB.length) return false;

  // Comparação em tempo constante: `===` sai no primeiro byte diferente, o que
  // permite descobrir o segredo byte a byte medindo o tempo de resposta.
  return timingSafeEqual(bufferA, bufferB);
}

function extrairBearer(header: string | undefined): string | null {
  const prefixo = 'Bearer ';
  if (!header?.startsWith(prefixo)) return null;

  const token = header.slice(prefixo.length).trim();
  return token || null;
}

/**
 * O hash que o banco guarda no lugar do token.
 *
 * SHA-256 puro, sem sal nem argon2: o token tem 256 bits aleatórios, então não
 * há dicionário para atacar — o argon2 existe para senha de gente, que é curta e
 * previsível. E o hash puro é o que permite achar a máquina pelo índice único.
 */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Um token novo de máquina: 32 bytes aleatórios, em hexadecimal. */
export function gerarTokenDaMaquina(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Confere o segredo de instalação do cadastro.
 *
 * Sem `AGENT_ENROLL_SECRET` configurado, libera — situação que `validateEnv()` só
 * tolera fora de produção, onde ela derruba o boot.
 */
export function conferirSegredoDeCadastro(authorizationHeader: string | undefined): boolean {
  const segredo = getAgentEnrollSecret();
  if (!segredo) return true;

  const bruto = extrairBearer(authorizationHeader);
  return bruto !== null && equalsSeguro(bruto, segredo);
}

/**
 * Autentica a conexão do `/agent-hub` pelo token da máquina e devolve o HWID
 * dela, ou `null`. Não há atalho: nem o segredo de instalação nem a falta dele
 * em desenvolvimento abrem o hub.
 */
export async function autenticarAgente(authorizationHeader: string | undefined): Promise<{ hwid: string } | null> {
  const token = extrairBearer(authorizationHeader);
  if (!token) return null;

  // A busca é pelo hash, num índice único: não há comparação de segredo em
  // JavaScript para medir o tempo, e o banco nunca vê o token.
  return prisma.agentCredential.findUnique({
    where: { tokenHash: hashDoToken(token) },
    select: { hwid: true },
  });
}

/**
 * Se a credencial do HWID ainda existe. A conexão aberta antes de a máquina ser
 * excluída (DD) passou pelo token na abertura; sem esta conferência no
 * Handshake, ela recriaria a máquina que acabou de sair.
 */
export async function credencialAindaVale(hwid: string): Promise<boolean> {
  return (await prisma.agentCredential.count({ where: { hwid } })) > 0;
}

import crypto from 'crypto';

// A FORMA DO TOKEN DE API: `prefixo.segredo`.
//
// DUAS PARTES, e a divisão é o que torna a busca possível sem comparar o
// segredo com a tabela inteira: o PREFIXO é indexado e público (é a chave de
// busca), e o SEGREDO nunca é gravado — só o sha256 dele.
//
// Sem o prefixo, autenticar exigiria ler todas as linhas e comparar o hash de
// cada uma. Com ele, é um `findUnique` e uma comparação.
//
// SHA-256, NÃO ARGON2, e isto é decisão e não economia. Argon2 é caro de
// propósito: é o que protege SENHA HUMANA contra força bruta offline, porque
// senha humana vem de um espaço pequeno e adivinhável. Um segredo de 32 bytes
// aleatórios não tem dicionário a atacar — quem tiver o hash não o quebra com
// GPU nenhuma —, e pagar 100 ms de KDF a cada handshake de agente é transformar
// a defesa da senha em lentidão da frota.

const BYTES_DO_PREFIXO = 6;
const BYTES_DO_SEGREDO = 32;

/** `sw_` no começo: quem vir o token num log sabe de onde ele é. */
const MARCA = 'sw_';

export interface TokenGerado {
  /** O que vai para o agente. Mostrado UMA vez e nunca mais. */
  token: string;
  prefix: string;
  tokenHash: string;
}

export function hashDoSegredo(segredo: string): string {
  return crypto.createHash('sha256').update(segredo).digest('hex');
}

export function gerarApiToken(): TokenGerado {
  const prefix = MARCA + crypto.randomBytes(BYTES_DO_PREFIXO).toString('hex');
  const segredo = crypto.randomBytes(BYTES_DO_SEGREDO).toString('base64url');

  return { token: `${prefix}.${segredo}`, prefix, tokenHash: hashDoSegredo(segredo) };
}

/**
 * Parte o token nas duas metades.
 *
 * Devolve `null` para qualquer coisa que não tenha a forma — inclusive o
 * `AGENT_TOKEN` compartilhado da F0, que não tem ponto nem a marca. É assim que
 * a convivência do D89 distingue os dois caminhos sem adivinhar.
 */
export function partirToken(token: string): { prefix: string; segredo: string } | null {
  if (!token.startsWith(MARCA)) return null;

  const ponto = token.indexOf('.');
  if (ponto <= MARCA.length) return null;

  const prefix = token.slice(0, ponto);
  const segredo = token.slice(ponto + 1);
  if (!segredo) return null;

  return { prefix, segredo };
}

/**
 * Compara o segredo em tempo constante.
 *
 * Os dois lados são hashes hexadecimais de 64 caracteres, então o tamanho é
 * sempre igual — mas a checagem fica assim mesmo: `timingSafeEqual` LANÇA com
 * tamanhos diferentes, e um dado corrompido na coluna viraria 500 em vez de
 * "token inválido".
 */
export function segredoConfere(segredo: string, hashGravado: string): boolean {
  const calculado = Buffer.from(hashDoSegredo(segredo));
  const gravado = Buffer.from(hashGravado);

  if (calculado.length !== gravado.length) return false;
  return crypto.timingSafeEqual(calculado, gravado);
}

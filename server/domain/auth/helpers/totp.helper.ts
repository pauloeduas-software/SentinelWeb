import crypto from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import { hashDoSegredo } from './api-token.helper';

// O SEGUNDO FATOR, em função pura (F11, Etapa H).
//
// Nada aqui toca banco, cifra ou requisição: entra texto, sai texto. Quem grava
// o segredo cifrado e quem conta tentativa errada é o
// `use-cases/manage-totp.usecase.ts` e o `login.usecase.ts` — este arquivo só
// sabe de RFC 6238 e de aleatoriedade.
//
// ═════════════════════════════════════════════════════════════════════════════
// A JANELA É DE ±1 PASSO, E A BIBLIOTECA MUDOU COMO ISSO SE ESCREVE.
//
// Na otplib 12 havia `window: 1` (em PASSOS). Na 13 o parâmetro é
// `epochTolerance`, em SEGUNDOS — então ±1 passo de 30s é `[30, 30]`, e não `1`.
// Passar `1` aqui compilaria e daria uma tolerância de um SEGUNDO: o código
// expiraria na virada do passo e a pessoa veria "código inválido" digitando o
// número que o celular mostra. É o tipo de erro que não aparece em teste rodado
// no primeiro segundo de um passo.
//
// POR QUE TOLERAR O PASSO SEGUINTE, e não só o anterior: o relógio do celular
// pode estar adiantado. Aceitar `[30, 0]` é mais rigoroso e transforma um
// telefone com NTP ruim num chamado de suporte — enquanto o ganho é recusar um
// código que o atacante teria de prever 30 segundos antes de ele existir.
//
// O que NÃO é tolerado: reuso. Um código já usado continua valendo dentro da
// janela dele, e fechar isso exigiria gravar o último `timeStep` por usuário
// (a otplib tem `afterTimeStep` para isso). Não entrou: o ganho real é contra
// quem intercepta o código em trânsito, e para esse atacante a sessão inteira já
// está comprometida. Ficou escrito aqui porque é a próxima coisa a fazer se o
// requisito mudar — e não um esquecimento.
// ═════════════════════════════════════════════════════════════════════════════

/** O passo do RFC 6238, e o padrão de todo autenticador. */
const PERIODO_SEGUNDOS = 30;

/** ±1 passo, expresso em segundos porque é o que a otplib 13 aceita. */
const TOLERANCIA: [number, number] = [PERIODO_SEGUNDOS, PERIODO_SEGUNDOS];

/**
 * O nome que aparece no aplicativo do celular.
 *
 * Constante, e não vindo do `AppSetting` de marca: ele entra no QR e é por ele
 * que a pessoa reconhece a linha entre os quinze códigos que tem no autenticador.
 * Trocá-lo depois do cadastro não reescreve o que já foi lido — a linha antiga
 * fica com o nome velho —, então um valor configurável criaria uma lista de
 * nomes diferentes para o mesmo sistema.
 */
const EMISSOR = 'SentinelWeb';

/** Quantos códigos de recuperação a confirmação entrega. */
const QUANTIDADE_DE_RECUPERACAO = 8;

/**
 * O alfabeto dos códigos de recuperação.
 *
 * Base32 de Crockford SEM `I`, `L`, `O`, `U`: o código é lido de um papel e
 * digitado à mão, e `0`/`O` e `1`/`I` são o erro de digitação que vira chamado.
 * `U` sai para não formar palavra ofensiva por acidente.
 */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Cada metade de um código: `XXXXX-XXXXX`. */
const BLOCO = 5;

/** O AAD que amarra o segredo à LINHA onde ele mora (D81, item 3). */
export function aadDoSegredoTotp(userId: string): string {
  return `users:totpSecret:${userId}`;
}

/**
 * Um segredo novo, em base32 — o que vira QR e o que o autenticador guarda.
 *
 * 20 bytes (160 bits) é o padrão da otplib e o que o RFC 4226 recomenda para
 * HMAC-SHA1. Mais do que isso não aumenta a segurança do esquema (o código tem
 * 6 dígitos, e é ele o gargalo) e alguns autenticadores antigos truncam.
 */
export function gerarSegredoTotp(): string {
  return generateSecret();
}

/**
 * A URI `otpauth://` que o QR carrega.
 *
 * O rótulo é o nome de acesso ou o e-mail — é o que distingue duas contas do
 * mesmo sistema no mesmo celular (o administrador que tem conta de teste).
 */
export function uriDoAutenticador(opcoes: { secret: string; conta: string }): string {
  return generateURI({
    issuer: EMISSOR,
    label: opcoes.conta,
    secret: opcoes.secret,
    period: PERIODO_SEGUNDOS,
  });
}

/**
 * Só dígitos, e exatamente seis?
 *
 * Separado da conferência porque a resposta importa ANTES dela: um corpo com
 * `totp: "abc"` é 422 de forma (o zod o pega), e um `totp: "12345"` digitado
 * pela metade não deve custar um HMAC nem contar como tentativa errada de
 * segundo fator.
 */
export function pareceCodigoTotp(valor: string): boolean {
  return /^\d{6}$/.test(valor.trim());
}

/**
 * O código confere para este segredo, dentro da janela?
 *
 * `async` porque a otplib 13 faz HMAC por plugin, e o plugin padrão é assíncrono.
 * A comparação em tempo constante é da biblioteca.
 */
export async function conferirCodigoTotp(secret: string, codigo: string): Promise<boolean> {
  if (!pareceCodigoTotp(codigo)) return false;

  const resultado = await verify({
    secret,
    token: codigo.trim(),
    epochTolerance: TOLERANCIA,
    period: PERIODO_SEGUNDOS,
  });

  return resultado.valid;
}

/** Um bloco aleatório do alfabeto, sem viés de módulo. */
function blocoAleatorio(tamanho: number): string {
  let saida = '';
  while (saida.length < tamanho) {
    // Rejeição: `randomInt(0, n)` da lib padrão já é uniforme, e usá-lo evita o
    // `% ALFABETO.length` que favoreceria os primeiros caracteres.
    saida += ALFABETO[crypto.randomInt(0, ALFABETO.length)];
  }
  return saida;
}

export interface CodigosDeRecuperacao {
  /** Mostrados UMA vez, na confirmação. Não existem em lugar nenhum depois. */
  emClaro: string[];
  /** O que vai para o banco. */
  hashes: string[];
}

/**
 * Oito códigos de recuperação, e os hashes deles.
 *
 * `10` caracteres de um alfabeto de 32 são 50 bits — muito acima do que um
 * atacante online alcança contra o rate limit do login, e o suficiente para o
 * sha256 não ter dicionário a atacar num vazamento do banco.
 *
 * OITO, e não dois: eles são de uso único, e a pessoa que perdeu o celular vai
 * precisar de um para entrar e outro para reconfigurar. Dois códigos seria uma
 * conta trancada no segundo incidente.
 */
export function gerarCodigosDeRecuperacao(): CodigosDeRecuperacao {
  const emClaro = Array.from(
    { length: QUANTIDADE_DE_RECUPERACAO },
    () => `${blocoAleatorio(BLOCO)}-${blocoAleatorio(BLOCO)}`,
  );

  return { emClaro, hashes: emClaro.map(hashDoSegredo) };
}

/**
 * Tira do que foi digitado o que não é o código: espaço, hífen e caixa.
 *
 * Quem lê de um papel digita `abcde fghjk`, `ABCDE-FGHJK` ou com o hífen no
 * lugar errado. Normalizar na ENTRADA e hashear a forma canônica é o que faz o
 * uso único funcionar — sem isto, o mesmo código com e sem hífen seriam dois
 * hashes diferentes, e o primeiro nunca casaria com o que está gravado.
 */
export function normalizarCodigoDeRecuperacao(valor: string): string {
  const limpo = valor.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (limpo.length !== BLOCO * 2) return limpo;
  return `${limpo.slice(0, BLOCO)}-${limpo.slice(BLOCO)}`;
}

/**
 * O código casa com algum dos hashes guardados? Devolve o que SOBRA.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DUAS COISAS QUE ESTA FUNÇÃO FAZ DE PROPÓSITO E PARECEM DESLEIXO:
 *
 * 1. **varre todos os hashes sem parar no primeiro acerto.** Um `find` sairia
 *    mais cedo para quem acertou o primeiro código da lista do que para quem
 *    acertou o oitavo, e a diferença é medível. Oito comparações de 64 bytes
 *    custam nada.
 *
 * 2. **devolve a lista nova em vez de mutar a recebida.** Quem grava é o
 *    use-case, numa transação; uma função pura que apagasse o elemento no array
 *    do chamador faria o estado "código já usado" existir antes do `UPDATE`
 *    confirmar — e um rollback deixaria memória e banco discordando.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export function consumirCodigoDeRecuperacao(
  digitado: string,
  guardados: readonly string[],
): { restantes: string[] } | null {
  const canonico = normalizarCodigoDeRecuperacao(digitado);
  if (canonico.length !== BLOCO * 2 + 1) return null;

  const hashDigitado = Buffer.from(hashDoSegredo(canonico));

  let indice = -1;
  for (let i = 0; i < guardados.length; i += 1) {
    const guardado = Buffer.from(guardados[i]);
    if (guardado.length !== hashDigitado.length) continue;
    if (crypto.timingSafeEqual(guardado, hashDigitado)) indice = i;
  }

  if (indice === -1) return null;

  return { restantes: guardados.filter((_, i) => i !== indice) };
}

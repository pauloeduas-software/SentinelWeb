import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { chaveiro, type ChaveDeCriptografia } from './keyring';

// CIFRA E DECIFRA — AES-256-GCM, um arquivo e um formato para os dois usos (D81).
//
// A F6 guarda a chave de produto de uma licença; a F9 vai guardar campo
// customizado marcado como segredo. Os dois planos previam arquivos e formatos
// diferentes, e o que chegasse segundo encontraria o primeiro com o nome errado
// e o formato incompatível. Duas formas de ler o mesmo tipo de dado é a origem
// do problema que esta função fecha.
//
// ═════════════════════════════════════════════════════════════════════════════
// O FORMATO, E OS TRÊS MOTIVOS
//
//   enc:v1:<kid>:<iv b64>:<tag b64>:<ct b64>
//
// 1. O PREFIXO `enc:` ESTÁ SEMPRE PRESENTE, inclusive onde é redundante. Na F9
//    ele é obrigatório: dentro do mesmo JsonB convivem valores cifrados e
//    valores comuns, e sem marca não há como saber qual é qual. Aqui, numa
//    coluna dedicada, ele não seria preciso — e entra assim mesmo, porque UM
//    formato significa UMA função de leitura.
//
// 2. O `kid` VIAJA DENTRO DO VALOR, ao lado da versão do algoritmo. É o que
//    permite duas chaves ao mesmo tempo (ver `keyring.ts`).
//
// 3. O VALOR É AMARRADO AO LUGAR ONDE MORA, por AAD: `"<tabela>:<coluna>:<id>"`.
//    Sem isso, quem tem acesso ao banco copia a chave cifrada de uma licença
//    para outra e o sistema A REVELA COMO LEGÍTIMA — a cifra continua válida,
//    porque nada nela diz de onde veio. Com o AAD, a tag de autenticação não
//    confere e a leitura falha, que é o comportamento certo.
//
// O PREÇO DO ITEM 3, e ele é real: o `id` da linha entra na cifra, então
// precisa ser gerado PELA APLICAÇÃO antes do INSERT, não pelo `@default(uuid())`
// do banco. É uma linha a mais no use-case de criação, e é barato perto de um
// segredo que se deixa mover entre registros.
// ═════════════════════════════════════════════════════════════════════════════

const ALGORITMO = 'aes-256-gcm';
const PREFIXO = 'enc';
const VERSAO = 'v1';
/** 12 bytes é o tamanho nativo do GCM: outro valor força o modo de derivação. */
const TAMANHO_DO_IV = 12;
const PARTES = 6;

/**
 * Erro de criptografia. Status 500 de propósito: chegar aqui significa que a
 * configuração do servidor mudou por baixo do dado, não que o cliente errou o
 * pedido.
 *
 * A MENSAGEM NUNCA CARREGA O VALOR nem parte dele — quem a lê é o log e,
 * traduzida pelo error-handler, o cliente.
 */
export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

/** Isto é um valor cifrado por esta função? Barato, sem tentar decifrar. */
export function estaCifrado(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && valor.startsWith(`${PREFIXO}:${VERSAO}:`);
}

/**
 * Qual chave cifrou este valor. `null` quando o formato não é o desta função.
 *
 * O `kid` é um rótulo PÚBLICO — ele viaja em claro dentro de toda linha cifrada
 * justamente para poder ser lido sem chave nenhuma. Quem pergunta é o canário:
 * ele precisa saber se o que está gravado ainda é da chave ATIVA ou de uma
 * aposentada, e essa é a única forma de saber sem decifrar e comparar.
 */
export function kidDoPacote(pacote: string): string | null {
  const partes = pacote.split(':');
  if (partes.length !== PARTES || partes[0] !== PREFIXO || partes[1] !== VERSAO) return null;
  return partes[2];
}

/**
 * Cifra `claro` amarrando o resultado a `aad`.
 *
 * O `aad` é o ENDEREÇO do valor — `"licenses:productKey:<id>"` —, e quem o monta
 * é o domínio, porque só ele sabe onde o dado mora. Passar string vazia aqui
 * compila e desmonta a defesa inteira, então o parâmetro é obrigatório e o
 * vazio é recusado.
 */
export function cifrar(claro: string, aad: string): string {
  if (!aad) throw new CryptoError('AAD vazio: o valor cifrado precisa ser amarrado ao lugar onde mora.');

  const { ativa } = chaveiro();
  if (!ativa) {
    throw new CryptoError('Nenhuma chave de criptografia ativa configurada (APP_ENCRYPTION_KEY).');
  }

  const iv = randomBytes(TAMANHO_DO_IV);
  const cipher = createCipheriv(ALGORITMO, ativa.bytes, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));

  const ct = Buffer.concat([cipher.update(claro, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIXO, VERSAO, ativa.kid,
    iv.toString('base64'), tag.toString('base64'), ct.toString('base64'),
  ].join(':');
}

/**
 * Decifra, conferindo o `aad`.
 *
 * Falha quando a chave sumiu do chaveiro (`kid` desconhecido), quando o valor
 * foi adulterado, e — o caso que importa — quando ele foi COPIADO de outra
 * linha: o AAD não bate e a tag de autenticação recusa. As três dão a mesma
 * família de erro de propósito: distinguir "chave errada" de "valor mexido"
 * numa mensagem de erro é contar ao atacante qual das duas ele conseguiu.
 */
export function decifrar(pacote: string, aad: string): string {
  if (!aad) throw new CryptoError('AAD vazio: não é possível conferir a origem do valor cifrado.');

  const partes = pacote.split(':');
  if (partes.length !== PARTES || partes[0] !== PREFIXO) {
    throw new CryptoError('Valor cifrado em formato desconhecido.');
  }

  const [, versao, kid, ivB64, tagB64, ctB64] = partes;
  if (versao !== VERSAO) throw new CryptoError(`Versão de cifra não suportada: ${versao}`);

  const chave = chaveiro().porKid.get(kid);
  if (!chave) {
    // A frase diz o `kid` porque ele NÃO é segredo — ele é um rótulo público
    // gravado em toda linha —, e é exatamente o que alguém precisa para
    // descobrir que a chave daquele período não está mais configurada.
    throw new CryptoError(
      `Nenhuma chave configurada com o identificador "${kid}". ` +
        'A chave que cifrou este valor foi trocada ou removida do ambiente.',
    );
  }

  try {
    const decipher = createDecipheriv(ALGORITMO, chave.bytes, Buffer.from(ivB64, 'base64'));
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // O erro original do OpenSSL não é propagado: ele não acrescenta nada que
    // quem lê o log possa usar, e `sanitizeError` já guardaria a mensagem dele.
    throw new CryptoError(
      'Não foi possível decifrar o valor: ele foi adulterado, ou não pertence a este registro.',
    );
  }
}

/**
 * O CANÁRIO — o texto conhecido que o boot decifra para provar que o chaveiro
 * ainda abre o que está gravado (D91).
 *
 * `AppSetting` é linha única (`id = "singleton"`), então o AAD é fixo. Não há
 * id variável para amarrar, e é o certo: o canário não é segredo de ninguém, é
 * um teste de encaixe.
 */
export const CANARIO_TEXTO = 'sentinel-canario-v1';
export const CANARIO_AAD = 'app_settings:cryptoCanary:singleton';

export function cifrarCanario(): string {
  return cifrar(CANARIO_TEXTO, CANARIO_AAD);
}

/**
 * Confere o canário. Devolve o motivo em texto quando NÃO confere, `null`
 * quando está tudo certo — a mesma forma do `motivoParaNaoExcluir`: quem chama
 * não reinterpreta um booleano para montar a frase.
 *
 * `timingSafeEqual` aqui é zelo barato: o canário é público e comparar com
 * `===` não vaza nada de útil, mas esta é a única comparação de texto decifrado
 * do sistema e a próxima pode não ser pública.
 */
export function conferirCanario(guardado: string): string | null {
  let claro: string;
  try {
    claro = decifrar(guardado, CANARIO_AAD);
  } catch (erro) {
    return erro instanceof Error ? erro.message : 'canário ilegível';
  }

  const esperado = Buffer.from(CANARIO_TEXTO, 'utf8');
  const obtido = Buffer.from(claro, 'utf8');
  if (obtido.length !== esperado.length || !timingSafeEqual(obtido, esperado)) {
    return 'o canário decifrou para um valor diferente do esperado';
  }
  return null;
}

export type { ChaveDeCriptografia };

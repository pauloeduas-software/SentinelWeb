import { createHash } from 'node:crypto';
import './../config/load-env';

// O CHAVEIRO — as chaves de criptografia configuradas, indexadas por `kid`.
//
// Mora em `core/` e não em `domain/license/` porque NÃO TEM CONHECIMENTO DE
// NEGÓCIO: ele sabe ler variável de ambiente e derivar um identificador, e
// nada mais. A F9 (campo customizado cifrado em repouso) usa o mesmo chaveiro
// (D81).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE UM CHAVEIRO E NÃO UMA CHAVE (D91)
//
// O D81 exige o `kid` dentro do valor cifrado, e o `kid` só serve para alguma
// coisa se existir mais de uma chave: é ele que permite ROTAÇÃO GRADUAL — a
// nova cifra, as antigas ainda decifram, e nenhuma linha fica ilegível no meio.
// Sem isso, rotacionar é reescrever todas as linhas numa janela, e o que
// falhar no meio fica sem volta.
//
// O `kid` É DERIVADO DA PRÓPRIA CHAVE, nunca configurado à mão. Um `kid` que
// se digita pode ser escrito errado, repetido entre duas chaves ou trocado sem
// que a chave mude — e qualquer um dos três produz exatamente o erro que a
// rotação existia para evitar, só que mais tarde e com uma causa a mais para
// procurar. Derivado, ele NÃO PODE DISCORDAR da chave: ele é uma função dela.
//
// Oito caracteres porque ele distingue entre as duas ou três chaves
// configuradas, não no universo — e porque ele fica gravado em TODA linha
// cifrada. O hash inteiro custaria 56 bytes por linha para não responder
// nenhuma pergunta a mais.
// ═════════════════════════════════════════════════════════════════════════════

/** AES-256 exige exatamente isto. Nem 31, nem 33. */
const TAMANHO_DA_CHAVE = 32;
const TAMANHO_DO_KID = 8;

export interface ChaveDeCriptografia {
  /** Os 8 primeiros caracteres hex de `sha256(chave)`. Viaja dentro do valor. */
  kid: string;
  bytes: Buffer;
}

export interface Chaveiro {
  /** A que CIFRA. Ausente quando `APP_ENCRYPTION_KEY` não está configurada. */
  ativa: ChaveDeCriptografia | null;
  /** Todas as que DECIFRAM — a ativa mais as aposentadas —, por `kid`. */
  porKid: Map<string, ChaveDeCriptografia>;
}

/**
 * Aceita hex (64 caracteres) ou base64. O `openssl rand -hex 32` do
 * `.env.example` produz o primeiro; um segredo vindo de cofre costuma ser o
 * segundo.
 *
 * Devolve `null` em vez de estourar quando o valor não serve: quem decide o que
 * fazer com isso é o `validateEnv`, que em produção derruba o boot e em
 * desenvolvimento avisa. Estourar aqui impediria até o aviso.
 */
function lerChave(bruta: string): ChaveDeCriptografia | null {
  const valor = bruta.replace(/^"|"$/g, '').trim();
  if (!valor) return null;

  const bytes = /^[0-9a-fA-F]{64}$/.test(valor)
    ? Buffer.from(valor, 'hex')
    : Buffer.from(valor, 'base64');

  if (bytes.length !== TAMANHO_DA_CHAVE) return null;

  return { kid: createHash('sha256').update(bytes).digest('hex').slice(0, TAMANHO_DO_KID), bytes };
}

/**
 * O chaveiro, lido do ambiente A CADA CHAMADA.
 *
 * Sem cache de propósito: o teste troca `process.env.APP_ENCRYPTION_KEY` entre
 * casos para provar que chave errada não decifra, e um módulo que memoiza no
 * corpo tornaria isso impossível sem recarregar o módulo. O custo é um
 * `sha256` de 32 bytes por operação de cifra — irrelevante ao lado do AES que
 * vem logo depois.
 */
export function chaveiro(): Chaveiro {
  const ativa = lerChave(process.env.APP_ENCRYPTION_KEY ?? '');

  const porKid = new Map<string, ChaveDeCriptografia>();
  if (ativa) porKid.set(ativa.kid, ativa);

  // As aposentadas: decifram o que já existe, nunca cifram nada novo. Separadas
  // por vírgula porque é o formato que um `.env` comporta sem virar JSON.
  for (const bruta of (process.env.APP_ENCRYPTION_KEYS_ANTIGAS ?? '').split(',')) {
    const chave = lerChave(bruta);
    // A ativa VENCE uma antiga de mesmo kid (que é a mesma chave listada duas
    // vezes): `set` só se ainda não existe.
    if (chave && !porKid.has(chave.kid)) porKid.set(chave.kid, chave);
  }

  return { ativa, porKid };
}

/** Há chave para cifrar? É o que separa o 422 do 201 ao gravar uma chave. */
export function temChaveAtiva(): boolean {
  return chaveiro().ativa !== null;
}

/**
 * O diagnóstico do que está configurado, para o `validateEnv`.
 *
 * Devolve o MOTIVO em texto, nunca a chave: esta string vai para o log e para a
 * mensagem de boot.
 */
export function diagnosticarChaveiro(): string | null {
  const bruta = (process.env.APP_ENCRYPTION_KEY ?? '').replace(/^"|"$/g, '').trim();
  if (!bruta) return 'APP_ENCRYPTION_KEY não configurada';
  if (!lerChave(bruta)) {
    return `APP_ENCRYPTION_KEY inválida: precisa ter ${TAMANHO_DA_CHAVE} bytes ` +
      '(64 caracteres hex, ou base64 equivalente)';
  }

  // AS ANTIGAS TAMBÉM, e o canário NÃO cobre isto: ele é gravado e conferido
  // com a chave ATIVA, então uma entrada mal escrita em
  // `APP_ENCRYPTION_KEYS_ANTIGAS` passa pelo boot sem ruído — `lerChave`
  // devolve `null` e o chaveiro fica sem aquela chave, calado. A falha aparece
  // semanas depois, na primeira tentativa de revelar uma chave cifrada antes da
  // rotação: exatamente a falha tardia e confusa que o D91 existe para evitar.
  const antigas = (process.env.APP_ENCRYPTION_KEYS_ANTIGAS ?? '')
    .split(',')
    .map((valor) => valor.replace(/^"|"$/g, '').trim())
    .filter((valor) => valor.length > 0);

  const invalidas = antigas
    .map((valor, indice) => (lerChave(valor) ? null : indice + 1))
    .filter((posicao): posicao is number => posicao !== null);

  if (invalidas.length > 0) {
    // A POSIÇÃO, nunca o valor: esta frase vai para o log e para a mensagem de
    // boot, e chave — mesmo inválida — não se escreve em log.
    return `APP_ENCRYPTION_KEYS_ANTIGAS: ${invalidas.length} de ${antigas.length} entrada(s) `
      + `inválida(s) (posição ${invalidas.join(', ')}), cada uma precisa ter `
      + `${TAMANHO_DA_CHAVE} bytes. O que foi cifrado com ela continua ilegível`;
  }

  return null;
}

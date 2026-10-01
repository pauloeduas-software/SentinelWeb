import { z } from 'zod';
import { AppError } from '../../../core/errors/app-error';
import { cifrar, estaCifrado } from '../../../core/crypto/cipher';
import { temChaveAtiva } from '../../../core/crypto/keyring';
import { normalizarValor, validadorDoFormato } from '../helpers/field-validator.helper';
import { aadDoCampo, MASCARA, semNulos } from '../helpers/custom-field-value.helper';
import type { CampoResolvido, ConjuntoResolvido } from './resolve-fieldset.usecase';

// A VALIDAÇÃO DO CONTEÚDO — onde o campo criado em runtime é conferido.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ISTO NÃO MORA NO ZOD DA BORDA, E NÃO É PREGUIÇA.
//
// O `createAssetSchema` valida `customFields` como UM campo:
// `z.record(z.string(), z.unknown()).optional()`. O conteúdo é conferido aqui.
//
// O `strictObject` da F0 recusa chave desconhecida — é o que fecha o mass
// assignment — e ele NÃO PODE conhecer campos criados em runtime. As duas saídas
// ruins eram:
//
//   - montar o schema por requisição, consultando `custom_fields` antes do
//     `parse`: o controller passaria a fazer I/O, e a garantia do
//     `strictObject` (a allowlist é estática e revisável) viraria uma allowlist
//     montada a partir do banco — que é o oposto de allowlist.
//   - deixar `customFields` como `z.any()`: mass assignment de volta pela brecha.
//
// Empurrar a validação de CONTEÚDO para cá mantém as duas garantias: a borda
// barra campo nativo desconhecido, e aqui se barra chave customizada
// desconhecida e valor fora do formato — onde o conjunto resolvido é conhecido.
//
// O ERRO SAI COM O `slug` NO CAMINHO, em `fields`, que é o mesmo formato do
// `formatZodError`: é assim que a tela sabe em qual input pintar a mensagem.
// ═════════════════════════════════════════════════════════════════════════════

/** O que já está gravado, lido por `lerCampos`. */
export type CamposGravados = Record<string, string>;

export interface EntradaDeValidacao {
  /** O conjunto resolvido do MODELO final do ativo (D58). */
  conjunto: ConjuntoResolvido;
  /**
   * O que veio no corpo. `undefined` significa **a chave nem veio** — e aí nada
   * muda, nem se confere obrigatoriedade (ver `CamposValidados`).
   */
  recebido: Record<string, unknown> | undefined;
  /** O que a linha já tem. Vazio na criação. */
  gravados: CamposGravados;
  /**
   * O id do ativo. Entra no AAD de todo valor cifrado (D81), então na CRIAÇÃO
   * ele precisa ser gerado pela aplicação ANTES do INSERT — é o preço declarado
   * do item 3 do D81.
   */
  assetId: string;
  /** Criação aplica o `defaultValue` do vínculo; edição não (ver abaixo). */
  criando: boolean;
}

export interface CamposValidados {
  /**
   * Pronto para a coluna, ou `null` quando não sobrou chave nenhuma — e aí quem
   * grava usa `Prisma.DbNull`, nunca `Prisma.JsonNull`.
   */
  valores: Record<string, string> | null;
  /** Os valores em CLARO das chaves cifradas ficaram de fora: só o pacote sai daqui. */
  orfaos: string[];
  /** `true` quando a chave `customFields` nem veio no corpo: o chamador não mexe na coluna. */
  intocado: boolean;
}

/**
 * Valida, cifra o que é cifrado, e devolve o objeto que vai para o JsonB.
 *
 * A FUNÇÃO NÃO ESCREVE NADA e não consulta nada: o conjunto resolvido e os
 * valores atuais chegam prontos. É o que a torna chamável de dentro da mesma
 * transação do `create`/`update` do ativo sem alongá-la com leituras.
 */
export function validarCamposCustomizados(entrada: EntradaDeValidacao): CamposValidados {
  const { conjunto, recebido, gravados, assetId, criando } = entrada;

  const porSlug = new Map(conjunto.campos.map((campo) => [campo.slug, campo]));

  // ── OS ÓRFÃOS: CHAVES DE UM CONJUNTO ANTERIOR (D60) ─────────────────────
  //
  // Trocar o modelo de um ativo pode trocar o conjunto dele, e as chaves do
  // conjunto antigo continuam no JSON. Elas NÃO SÃO APAGADAS: são dado do
  // cliente, o conjunto antigo pode voltar, e mantê-las custa zero. A tela não
  // as exibe no formulário, a validação as ignora, e um aviso conta quantas são.
  //
  // Apagar dado do cliente porque um `<select>` mudou é a "limpeza" que ninguém
  // pede e todos lamentam.
  const orfaos = Object.keys(gravados).filter((slug) => !porSlug.has(slug));

  // ── "NÃO MEXE" SÓ EXISTE NA EDIÇÃO ─────────────────────────────────────
  //
  // ═════════════════════════════════════════════════════════════════════════
  // Na EDIÇÃO, `undefined` significa "não mexe" — a mesma regra de todo campo
  // (`valorFinal` em update-asset.usecase.ts). É o que faz um
  // `PUT {"modelId": "..."}` trocar o modelo SEM tocar nos valores, e sem exigir
  // os obrigatórios do conjunto novo: é o único jeito de a promoção gradual do
  // D61 (opcional → backfill → obrigatório) não travar a edição do parque antigo.
  //
  // Na CRIAÇÃO não há nada para preservar, então `undefined` e `{}` são a MESMA
  // coisa — e tratá-los diferente era um FURO no D61: `POST /api/assets` sem a
  // chave `customFields` criava o ativo sem passar pela conferência de
  // obrigatoriedade. O formulário sempre manda a chave, então o furo não
  // aparecia na tela; quem chamasse a API à mão criava ativo inválido, e o
  // "obrigatório" passava a valer só para quem usava o painel.
  // ═════════════════════════════════════════════════════════════════════════
  if (recebido === undefined && !criando) {
    return { valores: null, orfaos, intocado: true };
  }

  /**
   * O que efetivamente se valida. Na criação, a chave ausente é um objeto vazio
   * — ver o bloco acima.
   */
  const recebidoEfetivo = recebido ?? {};

  // ── 1. CHAVE DESCONHECIDA É RECUSADA ───────────────────────────────────
  //
  // É o `strictObject` da borda aplicado ao conjunto resolvido: sem isto, um
  // `customFields: {"senha_admin": "..."}` para um ativo cujo conjunto não tem
  // esse campo gravaria a chave, e ela ficaria invisível em toda tela e imune a
  // toda validação — mass assignment dentro de uma coluna Json.
  const desconhecidas = Object.keys(recebidoEfetivo).filter((slug) => !porSlug.has(slug));
  if (desconhecidas.length > 0) {
    const fields: Record<string, string> = {};
    for (const slug of desconhecidas) fields[slug] = 'campo customizado não faz parte deste modelo';

    throw new AppError(
      `Campo customizado desconhecido para este modelo: "${desconhecidas.join('", "')}". `
      + (conjunto.fieldsetId
        ? `O conjunto em vigor é "${conjunto.fieldsetName}".`
        : 'O modelo deste ativo não tem conjunto de campos atribuído.'),
      422,
      { fields },
    );
  }

  // ── 2. NORMALIZAÇÃO, E A MÁSCARA SAINDO DE CENA ────────────────────────
  //
  // ═════════════════════════════════════════════════════════════════════════
  // A MÁSCARA DE VOLTA É DESCARTADA AQUI, ANTES DE TUDO — e a posição é a
  // correção de um furo real.
  //
  // O formulário de ativo reenvia TODO campo a cada salvamento, e a leitura
  // devolve `••••••` no lugar do pacote: a máscara chega de volta no corpo em
  // toda edição de um ativo que tenha campo cifrado. Descartá-la é o que
  // significa "não mexi neste campo".
  //
  // ELA PRECISA SAIR ANTES DA VALIDAÇÃO DE FORMATO E ANTES DO MERGE, e não na
  // hora de cifrar, por dois motivos que só aparecem juntos:
  //
  //   1. **formato**: um campo cifrado com `format: REGEX` recusaria `••••••` —
  //      a máscara não casa com o padrão do segredo. A edição de qualquer outro
  //      campo do ativo passaria a responder 422 num campo que ninguém tocou.
  //
  //   2. **obrigatoriedade**: descartada só na cifra, a máscara já teria
  //      passado pela conferência do passo 5 como um valor PRESENTE. Um campo
  //      cifrado E obrigatório seria criado vazio mandando `••••••` — o
  //      obrigatório driblado por um valor que o próprio sistema imprimiu.
  //
  // Um valor que já chega CIFRADO recebe o mesmo tratamento, pelo mesmo motivo
  // do item 1: o cliente devolveu o que leu. Recifrar um pacote produziria
  // cifra de cifra, e decifrar devolveria `enc:v1:…` como se fosse o segredo.
  // ═════════════════════════════════════════════════════════════════════════
  const normalizados: Record<string, string | null> = {};
  const naoEscalares: string[] = [];

  for (const [slug, bruto] of Object.entries(recebidoEfetivo)) {
    const valor = normalizarValor(bruto);
    if (valor === undefined) {
      naoEscalares.push(slug);
      continue;
    }

    // `porSlug.get` é seguro: chave desconhecida foi recusada no passo 1.
    const campo = porSlug.get(slug)!;
    if (campo.encrypted && valor !== null && (valor === MASCARA || estaCifrado(valor))) continue;

    normalizados[slug] = valor;
  }

  if (naoEscalares.length > 0) {
    const fields: Record<string, string> = {};
    for (const slug of naoEscalares) fields[slug] = 'use um texto, número ou verdadeiro/falso';
    throw new AppError(
      `Valor de campo customizado em formato não aceito: "${naoEscalares.join('", "')}".`,
      422,
      { fields },
    );
  }

  // ── 3. O PADRÃO DO VÍNCULO, SÓ NA CRIAÇÃO ──────────────────────────────
  //
  // `defaultValue` é SUGESTÃO para o ativo novo, não backfill: aplicá-lo na
  // edição sobrescreveria, a cada salvamento, um campo que alguém apagou de
  // propósito — e aplicá-lo retroativamente seria escrever em N mil linhas por
  // causa de uma edição de catálogo.
  if (criando) {
    for (const campo of conjunto.campos) {
      if (campo.defaultValue === null) continue;
      if (campo.slug in normalizados) continue;
      normalizados[campo.slug] = campo.defaultValue;
    }
  }

  // ── 4. O FORMATO, SÓ DO QUE CHEGOU ─────────────────────────────────────
  //
  // ⚠️ SÓ DO QUE CHEGOU, e isso é uma decisão: revalidar os valores já gravados
  // travaria a edição inteira quando `listValues` mudasse e um valor antigo
  // saísse da lista — e o plano diz o contrário (valor fora da lista NÃO é
  // apagado; a tela o mostra marcado). Um valor gravado já passou por aqui uma
  // vez; recusá-lo agora puniria quem foi editar outro campo.
  const forma: Record<string, z.ZodType> = {};
  for (const slug of Object.keys(normalizados)) {
    const campo = porSlug.get(slug)!;
    // `.nullable()`: limpar um campo é operação legítima, e o obrigatório é
    // conferido no passo 5, sobre o estado FINAL.
    forma[slug] = validadorDoFormato(campo, campo.name).nullable();
  }

  // `z.object` e não `strictObject`: a chave desconhecida já foi recusada no
  // passo 1, com uma mensagem que diz qual conjunto está em vigor — muito mais
  // útil que o "unrecognized_keys" em inglês do zod.
  //
  // A rejeição sobe como `ZodError` e o `error-handler` a traduz em 422 com
  // `fields: { "<slug>": "<mensagem>" }` — o `slug` no CAMINHO, que é o que a
  // tela usa para pintar o input certo.
  const validados = z.object(forma).parse(normalizados) as Record<string, string | null>;

  // ── 5. O ESTADO FINAL E A OBRIGATORIEDADE (D61) ────────────────────────
  //
  // Sobre o MERGE, não sobre o que chegou: obrigatoriedade vale em todo save, e
  // conferi-la só no que veio no corpo faria um PUT parcial "zerar" a exigência.
  const final: Record<string, string | null> = {};
  for (const campo of conjunto.campos) {
    const chave = campo.slug;
    final[chave] = chave in validados ? validados[chave] : gravados[chave] ?? null;
  }

  // ── 5b. A CIFRA, E ELA VEM ANTES DA CONFERÊNCIA DE OBRIGATORIEDADE ─────
  //
  // A ordem importa: o que a conferência abaixo precisa saber é se o campo tem
  // valor DEPOIS de tudo — e para um campo cifrado isso só se sabe depois de
  // resolver o que fazer com o que chegou. Cifrar depois deixaria a conferência
  // olhando o texto em claro, o que dá o mesmo resultado, mas a ordem inversa é
  // a que sobreviveu a um furo (ver o passo 2) e vale mantê-la explícita.
  for (const campo of conjunto.campos) {
    if (!campo.encrypted) continue;
    final[campo.slug] = cifrarSeNovo(campo, final[campo.slug], gravados[campo.slug] ?? null, assetId);
  }

  const faltando = conjunto.campos.filter(
    (campo) => campo.required && (final[campo.slug] === null || final[campo.slug] === ''),
  );

  if (faltando.length > 0) {
    const fields: Record<string, string> = {};
    for (const campo of faltando) fields[campo.slug] = `${campo.name} é obrigatório`;

    throw new AppError(
      faltando.length === 1
        ? `${faltando[0].name} é obrigatório.`
        : `Campos obrigatórios não preenchidos: ${faltando.map((campo) => campo.name).join(', ')}.`,
      422,
      { fields },
    );
  }

  // ── 6. OS ÓRFÃOS VOLTAM INTACTOS — inclusive cifrados, inclusive fora da
  //       lista (D60).
  const comOrfaos: Record<string, string | null> = { ...final };
  for (const slug of orfaos) comOrfaos[slug] = gravados[slug];

  const valores = semNulos(comOrfaos);

  return {
    // `null` quando não sobrou chave: quem grava usa `DbNull`, e é isso que
    // mantém `customFields IS NULL` honesto.
    valores: Object.keys(valores).length === 0 ? null : valores,
    orfaos,
    intocado: false,
  };
}

/**
 * Cifra o valor de um campo cifrado, quando ele é NOVO.
 *
 * Chega aqui só o que passou pelo passo 2, então a máscara e o pacote reenviados
 * já viraram "não mexi" e o valor que resta é ou `null` (limpar), ou o pacote que
 * já estava gravado (o campo não veio no corpo), ou texto em claro digitado
 * agora.
 *
 * Reenviar o MESMO texto em claro produz um pacote novo, e é o certo: não há
 * como saber que é o mesmo sem decifrar. IV novo, pacote novo, mesmo segredo.
 */
function cifrarSeNovo(
  campo: CampoResolvido,
  valorFinal: string | null,
  valorGravado: string | null,
  assetId: string,
): string | null {
  if (valorFinal === null) return null;
  // O pacote que já estava gravado, vindo do merge: nada a fazer.
  if (valorFinal === valorGravado && estaCifrado(valorFinal)) return valorGravado;

  if (!temChaveAtiva()) {
    throw new AppError(
      `O campo "${campo.name}" é cifrado em repouso e a chave de criptografia não está `
      + 'configurada (APP_ENCRYPTION_KEY). Configure a variável ou salve o ativo sem este campo.',
      422,
      { fields: { [campo.slug]: 'cifra indisponível neste ambiente' } },
    );
  }

  return cifrar(valorFinal, aadDoCampo(assetId, campo.slug));
}

import { Prisma } from '@prisma/client';
import { estaCifrado } from '../../../core/crypto/cipher';

// OS VALORES DENTRO DO JsonB — leitura, máscara e diff. Função pura, sem I/O.
//
// O que está guardado em `assets.customFields` é um objeto de UM nível: `slug`
// → texto. Nunca aninhado, nunca `null` como valor (limpar um campo REMOVE a
// chave — ver `semNulos` abaixo), e nunca número ou booleano
// (`field-validator.helper.ts` explica por quê).

/**
 * O que a leitura devolve no lugar de um valor cifrado.
 *
 * Seis pontos e não o valor de tamanho real: revelar o COMPRIMENTO de um
 * segredo é informação de graça para quem está tentando adivinhá-lo, e não
 * ajuda quem lê a tela. Diferente da máscara de chave de produto — que preserva
 * a pontuação de propósito, para dar a reconhecer o formato —, aqui não há
 * formato a reconhecer.
 */
export const MASCARA = '••••••';

/**
 * O AAD do D81 — o ENDEREÇO do valor, e é ele que o amarra ao lugar onde mora.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * O `slug` ENTRA NO AAD, e o D81 fala de `"<tabela>:<coluna>:<id da linha>"`.
 *
 * A diferença é real e o motivo é a forma desta coluna: numa coluna dedicada
 * (`licenses.productKey`) há UM segredo por linha, então tabela + coluna + id
 * identificam o lugar sem ambiguidade. Aqui convivem N segredos na MESMA coluna
 * da MESMA linha — a chave do Wi-Fi e a senha do BIOS do mesmo notebook.
 *
 * Sem o `slug`, os dois teriam AAD idêntico, e quem tem acesso ao banco poderia
 * trocar um pelo outro: a tag de autenticação continuaria conferindo, e o
 * sistema revelaria a senha do BIOS como se fosse a do Wi-Fi. É exatamente o
 * ataque que o item 3 do D81 existe para fechar, uma camada abaixo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export function aadDoCampo(assetId: string, slug: string): string {
  return `assets:customFields.${slug}:${assetId}`;
}

/**
 * Lê a coluna `Json?` como o mapa que ela é.
 *
 * Defensivo de propósito: a coluna pode conter qualquer JSON — um valor gravado
 * por um `psql` à mão, por um importador futuro, ou pelo literal JSON `null`
 * (que é a armadilha do `JsonNull`). Nenhum desses pode virar 500 numa listagem
 * de ativos, então o que não é objeto de um nível vira `{}`.
 */
export function lerCampos(bruto: Prisma.JsonValue | null | undefined): Record<string, string> {
  if (bruto === null || bruto === undefined) return {};
  if (typeof bruto !== 'object' || Array.isArray(bruto)) return {};

  const mapa: Record<string, string> = {};
  for (const [slug, valor] of Object.entries(bruto)) {
    // Só texto entra. Um número ou booleano gravado por fora é lido como texto
    // para a tela conseguir mostrá-lo; objeto e array são descartados, porque
    // não há `<input>` que os desenhe.
    if (typeof valor === 'string') mapa[slug] = valor;
    else if (typeof valor === 'number' || typeof valor === 'boolean') mapa[slug] = String(valor);
  }
  return mapa;
}

/**
 * O que sai na resposta: o mesmo mapa, com todo valor cifrado trocado pela
 * máscara.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ELA NÃO PRECISA SABER QUAIS CAMPOS SÃO CIFRADOS — E ISSO É O PAGAMENTO DO
 * PREFIXO `enc:` SER SEMPRE PRESENTE (D81, item 1).
 *
 * A alternativa seria consultar `custom_fields WHERE encrypted` a cada leitura
 * para saber o que mascarar: uma consulta a mais por listagem, e uma segunda
 * fonte de verdade sobre o que está cifrado — que erraria justamente no caso
 * perigoso, o campo que FOI cifrado e teve a flag desligada depois.
 *
 * Com a marca dentro do valor, quem decide é o próprio dado. Um valor cifrado
 * que sobrou de um campo apagado continua mascarado, e não há como a flag e o
 * conteúdo discordarem.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export function mascararCampos(bruto: Prisma.JsonValue | null | undefined): Record<string, string> | null {
  const mapa = lerCampos(bruto);
  const slugs = Object.keys(mapa);
  // `null` e não `{}`: "este ativo não tem campo customizado nenhum" e "tem um
  // objeto vazio" são a mesma coisa para a tela, e devolver `null` deixa o
  // contrato igual ao da coluna.
  if (slugs.length === 0) return null;

  const saida: Record<string, string> = {};
  for (const slug of slugs) saida[slug] = estaCifrado(mapa[slug]) ? MASCARA : mapa[slug];
  return saida;
}

/** Tem algum valor cifrado aqui? É o que decide se a rota de revelar aparece. */
export function temCampoCifrado(bruto: Prisma.JsonValue | null | undefined): boolean {
  return Object.values(lerCampos(bruto)).some(estaCifrado);
}

/**
 * Remove as chaves de valor nulo/vazio.
 *
 * LIMPAR UM CAMPO REMOVE A CHAVE, não grava `null` nela. Um `{"ip_fixo": null}`
 * gravado faria `customFields ? 'ip_fixo'` (existência de chave) continuar
 * verdadeiro — e a contagem de "quantos ativos têm este campo preenchido", que é
 * a primeira pergunta da tela de administração e a base do `countUsages` do
 * campo, passaria a contar quem apagou o valor.
 */
export function semNulos(mapa: Record<string, string | null>): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [slug, valor] of Object.entries(mapa)) {
    if (valor !== null && valor !== '') saida[slug] = valor;
  }
  return saida;
}

/**
 * Uma chave do JsonB que mudou. Mesma forma do `CampoAlterado` do diff geral.
 *
 * `type` e não `interface`, pelo mesmo motivo documentado em
 * `shared/diff.helper.ts`: interface não ganha índice implícito e por isso não é
 * atribuível ao `InputJsonValue` do Prisma — o `changes` do `ActivityLog` não
 * aceitaria o resultado.
 */
export type MudancaDeCampo = {
  de: string | null;
  para: string | null;
};

/**
 * O PREFIXO das chaves de campo customizado dentro do `changes`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ELE RESOLVE DUAS COISAS QUE PARECIAM PEDIR SOLUÇÕES OPOSTAS.
 *
 * **Colisão.** O `slug` é escolhido pelo cliente, e nada impede que ele bata com
 * o nome de uma coluna nativa: um campo customizado chamado `serial`
 * sobrescreveria no histórico o diff da COLUNA `serial`. O ponto no prefixo
 * garante que isso não acontece — nenhuma coluna do Prisma tem ponto no nome.
 *
 * **Leitura.** A primeira versão resolvia a colisão ANINHANDO tudo sob
 * `customFields`, e isso quebrava a aba Histórico: o leitor genérico
 * (`src/pages/helpers/historico.helper.ts`) separa diff de detalhe pela FORMA do
 * valor — `{ de, para }` é mudança, o resto é detalhe —, então um objeto de
 * objetos caía em "detalhe" e era impresso como `[object Object]`.
 *
 * Com o prefixo, as entradas ficam PLANAS e no mesmo formato de toda outra
 * mudança, e a aba passa a lê-las sem saber que campo customizado existe.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const PREFIXO_NO_LOG = 'cf.';

/**
 * O diff CHAVE A CHAVE do JsonB, para o `ActivityLog`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DUAS RAZÕES PARA ELE EXISTIR SEPARADO DO `buildChanges`.
 *
 * 1. **Comparação rasa marca mudança a cada edição.** O `buildChanges` compara
 *    com `===` depois de normalizar escalares; dois objetos de mesmo conteúdo
 *    são instâncias diferentes e sempre diferem. `customFields` no
 *    `CAMPOS_AUDITADOS` do ativo escreveria uma linha de histórico em TODO PUT,
 *    com o objeto inteiro nos dois lados. É o mesmo problema que o `Decimal` deu
 *    na F1.
 *
 * 2. **VALOR CIFRADO NÃO ENTRA NO DIFF** (D62). Não mascarado, não truncado:
 *    fora. Um `ActivityLog` é lido por mais gente que o banco e guarda para
 *    sempre — pôr ali o que a cifra existe para proteger seria trocar um segredo
 *    cifrado numa coluna por um segredo em claro numa tabela de auditoria.
 *
 *    O que fica registrado é que o campo cifrado MUDOU (`de`/`para` com a
 *    máscara), porque *quando* um segredo foi trocado é informação de auditoria
 *    legítima — e não revela nada sobre ele.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export function diffDeCampos(
  antes: Record<string, string>,
  depois: Record<string, string>,
): Record<string, MudancaDeCampo> {
  const mudancas: Record<string, MudancaDeCampo> = {};

  for (const slug of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
    const de = antes[slug] ?? null;
    const para = depois[slug] ?? null;
    if (de === para) continue;

    mudancas[`${PREFIXO_NO_LOG}${slug}`] = {
      de: de !== null && estaCifrado(de) ? MASCARA : de,
      para: para !== null && estaCifrado(para) ? MASCARA : para,
    };
  }

  return mudancas;
}

import type { Prisma } from '@prisma/client';
import type { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { normalizarValor, validadorDoFormato } from '../helpers/field-validator.helper';
import { lerCampos, semNulos } from '../helpers/custom-field-value.helper';

// O PREENCHIMENTO EM MASSA DE UM CAMPO CUSTOMIZADO — o backfill que o D61 exige.
//
// ═════════════════════════════════════════════════════════════════════════════
// SEM ISTO, A PROMOÇÃO GRADUAL DO D61 NÃO TEM COMO ACONTECER.
//
// O D61 diz que o caminho para um campo virar obrigatório é *"nasce opcional, a
// edição em massa faz o backfill, e só então promove-se"* — e a tela de
// composição imprime exatamente isso ao lado do contador de quantos ativos
// quebrariam. O lote da F2, porém, só sabia três operações (status, localização
// e lixeira): o contador dizia o número certo e mandava o operador por uma porta
// que não abria. Preencher mil ativos era abrir mil formulários.
//
// A REGRA MORA AQUI, e não no `bulk-update-assets.usecase.ts`, pelo D64: o que o
// lote precisa saber de um campo customizado — se o valor serve ao formato, se o
// conjunto dos modelos selecionados pede esse campo, se limpar deixaria um
// obrigatório vazio — é conhecimento deste domínio. O use-case do ativo
// orquestra a transação; estas funções dizem o que pode.
//
// Nenhuma delas escreve: as três são chamáveis de DENTRO da transação do lote
// sem alongá-la com nada além das duas consultas que a segunda faz.
// ═════════════════════════════════════════════════════════════════════════════

/** Cliente aceito: o global ou o de transação. */
type ClienteDoLote = Pick<typeof prisma, 'customField' | 'assetModel' | 'customFieldsetField'>;

/** O campo resolvido e o valor já conferido contra o formato dele. */
export interface CampoDoLote {
  fieldId: string;
  slug: string;
  name: string;
  /** `null` é a operação de LIMPAR — e ela REMOVE a chave, não grava `null`. */
  valor: string | null;
}

/** O mínimo que a conferência de alcance precisa de um ativo do lote. */
export interface AtivoDoLoteComModelo {
  id: string;
  assetTag: string;
  modelId: string;
}

/**
 * O campo existe, aceita lote, e o valor serve ao formato dele?
 *
 * As três recusas saem ANTES de qualquer escrita, e é o que faz o lote ser tudo
 * ou nada (D21) sem precisar de rollback: um valor que não serve ao formato
 * barraria no primeiro ativo e deixaria a transação desfazendo o que já tinha
 * passado.
 */
export async function resolverCampoDoLote(
  client: ClienteDoLote,
  fieldId: string,
  valorBruto: string | null,
): Promise<CampoDoLote> {
  const campo = await client.customField.findUnique({
    where: { id: fieldId },
    select: {
      id: true, slug: true, name: true, element: true, format: true,
      regexPattern: true, listValues: true, encrypted: true,
    },
  });
  // 404 por conta própria, como o `status` e a `location` do lote: deixar a
  // ausência aparecer mais tarde devolveria uma mensagem sobre chave de JSON
  // para quem errou o id de um campo.
  if (!campo) throw new AppError('Campo customizado não encontrado.', 404);

  // ── CAMPO CIFRADO NÃO ENTRA EM LOTE (D62) ──────────────────────────────
  //
  // É a mesma recusa do `defaultValue` do vínculo, pelo mesmo motivo: um segredo
  // igual em duzentas máquinas não é segredo. E há um segundo motivo, só daqui:
  // o valor em claro viajaria numa requisição que afeta N ativos e o
  // `ActivityLog` guardaria N linhas dizendo que o segredo mudou — sem que
  // ninguém tenha escolhido um segredo por máquina.
  if (campo.encrypted) {
    throw new AppError(
      `O campo "${campo.name}" é cifrado e não pode ser preenchido em lote: um segredo igual `
      + 'em todos os ativos não é segredo. Preencha um por um, na tela de cada ativo.',
      422,
      { fields: { [campo.slug]: 'campo cifrado não aceita preenchimento em lote' } },
    );
  }

  // `normalizarValor` é o mesmo do formulário: `''` e `null` são as duas formas
  // de "não preenchido" e as duas significam LIMPAR. Um lote não manda objeto
  // nem array (o schema de entrada é `string | null`), então `undefined` aqui é
  // estado impossível — e cair para `null` seria transformar um erro em
  // apagamento silencioso de duzentas linhas.
  const valor = normalizarValor(valorBruto);
  if (valor === undefined) {
    throw new AppError(
      `Valor em formato não aceito para "${campo.name}": use um texto.`,
      422,
      { fields: { [campo.slug]: 'use um texto' } },
    );
  }

  if (valor !== null) {
    const conferido = validadorDoFormato(campo, campo.name).safeParse(valor);
    if (!conferido.success) {
      const motivo = conferido.error.issues[0]?.message ?? 'valor fora do formato esperado';
      // O `slug` no `fields` pelo mesmo motivo de sempre: é por ele que a tela
      // pinta a mensagem no campo certo — aqui, ao lado do seletor da barra.
      throw new AppError(motivo, 422, { fields: { [campo.slug]: motivo } });
    }
  }

  return { fieldId: campo.id, slug: campo.slug, name: campo.name, valor };
}

/**
 * O conjunto de CADA ativo do lote pede este campo?
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ESTA É A CONFERÊNCIA QUE IMPEDE O LOTE DE FABRICAR ÓRFÃO.
 *
 * Gravar `{"imei": "..."}` num ativo cujo modelo não pede `imei` criaria uma
 * chave invisível em toda tela e imune a toda validação — exatamente o que o
 * passo 1 do `validarCamposCustomizados` recusa no caminho de um ativo só. Pela
 * porta do lote seria pior: duzentas de uma vez.
 *
 * E a recusa é do LOTE INTEIRO (D21), não "aplica onde dá": uma seleção que
 * mistura notebooks e monitores é uma seleção errada, e preencher metade deixaria
 * o operador com um estado que ele não pediu e não sabe desfazer.
 *
 * DUAS CONSULTAS, independentes do tamanho do lote: uma resolve o conjunto dos
 * modelos DISTINTOS (a linha do D58, `model ?? model.category`), a outra pergunta
 * quais desses conjuntos têm o campo. Duzentos ativos de três modelos custam duas
 * consultas, não duzentas.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export async function assertCampoAlcancaOLote(
  client: ClienteDoLote,
  campo: CampoDoLote,
  ativos: AtivoDoLoteComModelo[],
): Promise<void> {
  const modelIds = [...new Set(ativos.map((ativo) => ativo.modelId))];

  const modelos = await client.assetModel.findMany({
    where: { id: { in: modelIds } },
    select: { id: true, customFieldsetId: true, category: { select: { customFieldsetId: true } } },
  });

  // A LINHA DO D58, uma vez por modelo distinto. Ela não pode ser reescrita aqui
  // de outra forma: `resolveFieldset` carrega a lista de campos inteira, que é
  // justamente o que não se quer por modelo num lote de duzentos.
  const conjuntoDoModelo = new Map<string, string | null>(
    modelos.map((modelo) => [modelo.id, modelo.customFieldsetId ?? modelo.category.customFieldsetId]),
  );

  const fieldsetIds = [...new Set(
    [...conjuntoDoModelo.values()].filter((id): id is string => id !== null),
  )];

  const vinculos = fieldsetIds.length === 0
    ? []
    : await client.customFieldsetField.findMany({
      where: { fieldId: campo.fieldId, fieldsetId: { in: fieldsetIds } },
      select: { fieldsetId: true, required: true },
    });
  const vinculoPorConjunto = new Map(vinculos.map((vinculo) => [vinculo.fieldsetId, vinculo]));

  const conjuntoDoAtivo = (ativo: AtivoDoLoteComModelo) => conjuntoDoModelo.get(ativo.modelId) ?? null;

  const foraDoConjunto = ativos.filter((ativo) => {
    const fieldsetId = conjuntoDoAtivo(ativo);
    return fieldsetId === null || !vinculoPorConjunto.has(fieldsetId);
  });

  if (foraDoConjunto.length > 0) {
    throw new AppError(
      `${foraDoConjunto.length} de ${ativos.length} ativos do lote não pedem o campo `
      + `"${campo.name}": o conjunto do modelo deles não o tem. `
      + `${listarEtiquetas(foraDoConjunto)} `
      + 'Tire-os da seleção, ou acrescente o campo ao conjunto desses modelos.',
      422,
      { ids: foraDoConjunto.map((ativo) => ativo.id) },
    );
  }

  // ── LIMPAR UM OBRIGATÓRIO É RECUSADO ───────────────────────────────────
  //
  // O obrigatório vale em TODO save (D61), e um lote que o esvaziasse deixaria N
  // ativos num estado que a edição de um só não produz — e que a próxima edição
  // de qualquer outro campo passaria a recusar, num campo que quem edita não
  // tocou. É o mesmo furo da máscara do item 4.1 do fechamento da F9, visto de
  // outro ângulo.
  if (campo.valor === null) {
    const obrigatorios = ativos.filter((ativo) => {
      const fieldsetId = conjuntoDoAtivo(ativo);
      return fieldsetId !== null && vinculoPorConjunto.get(fieldsetId)?.required === true;
    });

    if (obrigatorios.length > 0) {
      throw new AppError(
        `"${campo.name}" é obrigatório para ${obrigatorios.length} `
        + `${obrigatorios.length === 1 ? 'ativo do lote' : 'ativos do lote'} e não pode ser `
        + `esvaziado. ${listarEtiquetas(obrigatorios)} `
        + 'Para deixar de exigi-lo, desmarque "obrigatório" no conjunto primeiro.',
        422,
        { ids: obrigatorios.map((ativo) => ativo.id) },
      );
    }
  }
}

/**
 * As etiquetas dos primeiros ativos barrados, para a mensagem.
 *
 * Três e não todas: a mensagem aparece numa barra de ação com duzentos ativos
 * selecionados, e duzentas etiquetas numa frase não se lê. Três mais a contagem
 * é o que o operador precisa para achar o começo do problema — e os ids inteiros
 * continuam em `details.ids`, para a tela que quiser destacá-los.
 */
function listarEtiquetas(ativos: AtivoDoLoteComModelo[]): string {
  const primeiros = ativos.slice(0, 3).map((ativo) => ativo.assetTag).join(', ');
  return ativos.length > 3 ? `A começar por ${primeiros}.` : `São: ${primeiros}.`;
}

/** O antes, o depois e o que vai para a coluna — de UM ativo. */
export interface AplicacaoNoAtivo {
  antes: Record<string, string>;
  depois: Record<string, string>;
  /**
   * Pronto para a coluna, ou `null` quando não sobrou chave nenhuma — e aí quem
   * grava usa `Prisma.DbNull`, nunca `Prisma.JsonNull`.
   */
  valores: Record<string, string> | null;
}

/**
 * Aplica o valor do lote no JsonB de um ativo. PURA, sem I/O.
 *
 * As chaves que já estavam lá continuam — inclusive as órfãs de um conjunto
 * anterior e as cifradas (D60). O lote mexe em UMA chave, e `semNulos` é o que
 * faz limpar REMOVER a chave em vez de gravar `null` nela: um `{"imei": null}`
 * manteria `customFields ? 'imei'` verdadeiro, e a contagem que sustenta o 409 do
 * D64 e o contador do D61 passaria a contar quem apagou o valor.
 */
export function aplicarCampoNoAtivo(
  campo: CampoDoLote,
  bruto: Prisma.JsonValue | null,
): AplicacaoNoAtivo {
  const antes = lerCampos(bruto);
  const depois = semNulos({ ...antes, [campo.slug]: campo.valor });

  return {
    antes,
    depois,
    valores: Object.keys(depois).length === 0 ? null : depois,
  };
}

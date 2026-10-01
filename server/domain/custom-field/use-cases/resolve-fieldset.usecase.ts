import type { $Enums } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';

// O CONJUNTO RESOLVIDO — a regra do D58 em uma linha, num arquivo só.
//
// ═════════════════════════════════════════════════════════════════════════════
//   fieldset = model.customFieldsetId ?? model.category.customFieldsetId
//
// O modelo SOBREPÕE a categoria. Os dois níveis existem porque cada um responde
// a metade do problema: *por categoria* carrega a empresa inteira em seis
// atribuições (IP, hostname, patrimônio são da categoria *Notebook*), e *por
// modelo* é o único jeito de expressar o campo que só existe num modelo (o IMEI
// do tablet 4G). Escolher um lado deixaria metade dos casos sem resposta.
//
// E ELA MORA AQUI, numa função só, porque três leitores diferentes a fazem: o
// formulário (`GET /api/assets/fieldset?modelId=`), a criação de ativo e a
// edição. Três cópias divergiriam na primeira mudança de precedência — e a
// divergência seria invisível: cada leitor continuaria funcionando, mostrando um
// conjunto de campos diferente do que o outro valida.
// ═════════════════════════════════════════════════════════════════════════════
//
// `Asset` NÃO TEM `categoryId` — a categoria dele vem de `model.category` —,
// então a resolução é sempre um salto de dois níveis a partir do MODELO, nunca
// do ativo.

/** Cliente aceito: o global ou o de transação. */
type ClienteComModelo = Pick<typeof prisma, 'assetModel' | 'customFieldset'>;

/** De onde veio o conjunto. A tela mostra isso para a escolha não ser mágica. */
export type OrigemDoConjunto = 'MODEL' | 'CATEGORY';

/** Um campo do conjunto, com o que o VÍNCULO diz sobre ele (D61). */
export interface CampoResolvido {
  fieldId: string;
  slug: string;
  name: string;
  element: $Enums.CustomFieldElement;
  format: $Enums.CustomFieldFormat;
  regexPattern: string | null;
  listValues: string[];
  helpText: string | null;
  encrypted: boolean;
  showInListView: boolean;
  /** Do VÍNCULO, não do campo: o mesmo campo é obrigatório num conjunto e não noutro. */
  required: boolean;
  defaultValue: string | null;
  ordem: number;
}

export interface ConjuntoResolvido {
  fieldsetId: string | null;
  fieldsetName: string | null;
  /** `null` quando nenhuma das duas âncoras tem conjunto. */
  origem: OrigemDoConjunto | null;
  campos: CampoResolvido[];
}

/** O conjunto vazio — modelo sem conjunto na categoria nem nele. */
export const SEM_CONJUNTO: ConjuntoResolvido = {
  fieldsetId: null, fieldsetName: null, origem: null, campos: [],
};

/**
 * Resolve o conjunto de campos de um MODELO.
 *
 * DUAS CONSULTAS, e é mais barato que uma: numa consulta só, os dois conjuntos
 * (o do modelo e o da categoria) viriam com a lista de campos inteira, e uma das
 * duas listas seria descartada — em toda abertura do formulário de ativo. Aqui a
 * primeira lê duas colunas e a segunda carrega só o conjunto que venceu.
 */
export async function resolveFieldset(
  client: ClienteComModelo,
  modelId: string,
): Promise<ConjuntoResolvido> {
  const modelo = await client.assetModel.findUnique({
    where: { id: modelId },
    select: {
      customFieldsetId: true,
      category: { select: { customFieldsetId: true } },
    },
  });
  if (!modelo) throw new AppError('Modelo não encontrado.', 404);

  // A LINHA DO D58. O `??` é a precedência inteira.
  const fieldsetId = modelo.customFieldsetId ?? modelo.category.customFieldsetId;
  if (!fieldsetId) return SEM_CONJUNTO;

  const origem: OrigemDoConjunto = modelo.customFieldsetId ? 'MODEL' : 'CATEGORY';

  const conjunto = await client.customFieldset.findUnique({
    where: { id: fieldsetId },
    select: {
      id: true,
      name: true,
      fields: {
        // O DESEMPATE É O `fieldId`, e ele é obrigatório: `ordem` NÃO é único
        // (reordenar N vínculos numa transação colidiria com um
        // `@@unique([fieldsetId, ordem])`, porque constraint do Postgres é
        // imediata). Sem o segundo critério, dois campos de mesma ordem
        // trocariam de lugar entre duas leituras — e o formulário mudaria de
        // forma a cada abertura, sem ninguém ter editado nada.
        orderBy: [{ ordem: 'asc' }, { fieldId: 'asc' }],
        select: {
          fieldId: true,
          ordem: true,
          required: true,
          defaultValue: true,
          field: {
            select: {
              slug: true, name: true, element: true, format: true,
              regexPattern: true, listValues: true, helpText: true,
              encrypted: true, showInListView: true,
            },
          },
        },
      },
    },
  });

  // O conjunto apontado não existir é estado impossível (a FK é `Restrict`), e a
  // resposta certa é o conjunto vazio em vez de um 500: o formulário do ativo
  // não pode deixar de abrir por causa de uma inconsistência de catálogo.
  if (!conjunto) return SEM_CONJUNTO;

  return {
    fieldsetId: conjunto.id,
    fieldsetName: conjunto.name,
    origem,
    campos: conjunto.fields.map((vinculo) => ({
      fieldId: vinculo.fieldId,
      ordem: vinculo.ordem,
      required: vinculo.required,
      defaultValue: vinculo.defaultValue,
      ...vinculo.field,
    })),
  };
}

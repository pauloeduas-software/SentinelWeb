import type { $Enums } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { countAssetsQueQuebrariam } from './count-assets-with-field.usecase';

// A COMPOSIÇÃO DE UM CONJUNTO, com o número que o D61 manda mostrar.
//
// ═════════════════════════════════════════════════════════════════════════════
// `quebrariam` É A RAZÃO DESTA ROTA NÃO SER O `GET /api/custom-fieldsets/:id`
// GENÉRICO DO CATÁLOGO.
//
// O D61 diz que a promoção de um campo a obrigatório acontece com *"o contador de
// quantos quebrariam à vista"*. Sem esse número, marcar a caixa "obrigatório" é
// uma aposta: ou trava a edição de mil ativos antigos que ninguém preencheu, ou
// não trava nada — e não há como saber qual antes de salvar.
//
// Ele é calculado SÓ para o que ainda NÃO é obrigatório: um campo já obrigatório
// não pode ter ativo inválido no escopo dele, porque nenhum save passaria. Pedir
// a contagem para ele seria varrer `assets` para receber zero.
// ═════════════════════════════════════════════════════════════════════════════

type ClienteComConjunto = Pick<
  typeof prisma, 'customFieldset' | 'assetModel' | 'category' | '$queryRaw'
>;

export interface VinculoNaResposta {
  fieldId: string;
  slug: string;
  name: string;
  element: $Enums.CustomFieldElement;
  format: $Enums.CustomFieldFormat;
  listValues: string[];
  helpText: string | null;
  encrypted: boolean;
  ordem: number;
  required: boolean;
  defaultValue: string | null;
  /**
   * Quantos ativos VIVOS dos modelos que usam este conjunto ficariam inválidos
   * se o campo virasse obrigatório (D61). `0` quando ele já é obrigatório.
   */
  quebrariam: number;
}

export interface ComposicaoDoConjunto {
  id: string;
  name: string;
  /**
   * Os modelos alcançados pelo conjunto — direto ou pela categoria (D58).
   *
   * Sai na resposta porque é o ESCOPO de `quebrariam`: "12 ativos quebrariam" só
   * se lê junto com "este conjunto alcança 3 modelos". Sem o segundo número, um
   * zero pode significar "está tudo preenchido" ou "ninguém usa este conjunto",
   * que são situações opostas.
   */
  modelosAlcancados: number;
  fields: VinculoNaResposta[];
}

/**
 * Quais modelos este conjunto alcança.
 *
 * DOIS CAMINHOS, porque são duas âncoras (D58): o modelo que aponta direto para
 * o conjunto, e o modelo que herda da categoria — este último só quando ele
 * mesmo NÃO tem conjunto próprio, senão ele sobrepõe e não é alcançado.
 *
 * A segunda condição é a parte fácil de errar: sem o `customFieldsetId: null`, um
 * modelo com conjunto próprio dentro de uma categoria com outro conjunto seria
 * contado nos dois — e o `quebrariam` de um campo contaria ativos que aquele
 * campo nem alcança.
 */
export async function modelosDoConjunto(
  client: ClienteComConjunto,
  fieldsetId: string,
): Promise<string[]> {
  const modelos = await client.assetModel.findMany({
    where: {
      OR: [
        { customFieldsetId: fieldsetId },
        { customFieldsetId: null, category: { customFieldsetId: fieldsetId } },
      ],
    },
    select: { id: true },
  });
  return modelos.map((modelo) => modelo.id);
}

export async function listFieldsetFields(fieldsetId: string): Promise<ComposicaoDoConjunto> {
  const conjunto = await prisma.customFieldset.findUnique({
    where: { id: fieldsetId },
    select: {
      id: true,
      name: true,
      fields: {
        // O desempate pelo `fieldId` é obrigatório: `ordem` não é único (ver o
        // schema), e sem o segundo critério dois campos de mesma ordem trocariam
        // de lugar entre duas leituras — a tela mudaria de forma sozinha.
        orderBy: [{ ordem: 'asc' }, { fieldId: 'asc' }],
        select: {
          fieldId: true, ordem: true, required: true, defaultValue: true,
          field: {
            select: {
              slug: true, name: true, element: true, format: true,
              listValues: true, helpText: true, encrypted: true,
            },
          },
        },
      },
    },
  });
  if (!conjunto) throw new AppError('Registro não encontrado', 404);

  const modelIds = await modelosDoConjunto(prisma, fieldsetId);

  // Em SÉRIE e não em `Promise.all`, de propósito: cada contagem varre `assets`,
  // e disparar quarenta de uma vez concorreria com a própria aplicação por
  // conexão do pool para pintar uma tela de administração. Em série, a tela
  // demora um pouco mais e o resto do sistema não sente.
  const fields: VinculoNaResposta[] = [];
  for (const vinculo of conjunto.fields) {
    fields.push({
      fieldId: vinculo.fieldId,
      ordem: vinculo.ordem,
      required: vinculo.required,
      defaultValue: vinculo.defaultValue,
      ...vinculo.field,
      quebrariam: vinculo.required
        ? 0
        : await countAssetsQueQuebrariam(prisma, vinculo.field.slug, modelIds),
    });
  }

  return { id: conjunto.id, name: conjunto.name, modelosAlcancados: modelIds.length, fields };
}

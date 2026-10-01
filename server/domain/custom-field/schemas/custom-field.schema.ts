import { z } from 'zod';
import { uuidObrigatorio } from '../../shared/fields.schema';
import { MAX_VALOR } from '../helpers/field-validator.helper';
import { MAX_CAMPOS_POR_CONJUNTO } from '../use-cases/set-fieldset-fields.usecase';
import { MAX_SLUG } from '../helpers/slug.helper';

// Contrato de entrada das rotas de composição e de leitura do conjunto.
//
// A parte PLANA dos dois cadastros (campo e conjunto) não está aqui: ela é spec
// de catálogo, e o schema dela mora em
// `catalog/schemas/catalog-entities.schema.ts` (D64).

/**
 * `GET /api/assets/fieldset?modelId=` — o conjunto que o formulário vai desenhar.
 *
 * Por `modelId` e não por `assetId`, e a diferença aparece na criação: o
 * formulário precisa dos campos ANTES de o ativo existir, no instante em que o
 * usuário escolhe o modelo no `<select>`. Uma rota por ativo não atenderia o
 * cadastro, que é onde os campos obrigatórios mais importam.
 */
export const fieldsetQuerySchema = z.strictObject({
  modelId: uuidObrigatorio('modelo'),
});

/**
 * `GET /api/assets/:id/custom-fields/:slug/reveal`.
 *
 * O `slug` é validado com o MESMO formato do cadastro. Sem isto, um `:slug`
 * arbitrário chegaria ao `$queryRaw` do canário e ao `lerCampos` — e mesmo sendo
 * parametrizado, aceitar qualquer texto num identificador que existe para ser
 * fechado é abrir mão de graça.
 */
export const revealParamsSchema = z.strictObject({
  id: z.uuid('identificador inválido'),
  slug: z.string().trim().toLowerCase().max(MAX_SLUG)
    .regex(/^[a-z][a-z0-9_]*$/, 'identificador de campo inválido'),
});

/**
 * `PUT /api/custom-fieldsets/:id/fields` — a composição INTEIRA, de uma vez.
 *
 * A ORDEM É A DO ARRAY. Não há campo `ordem` no corpo de propósito: dois números
 * de ordem iguais, ou um buraco na sequência, seriam estados que a tela pode
 * produzir e que ninguém quer gravar. Com o índice do array, a ordem é
 * consistente por construção.
 *
 * `fields: []` é legítimo e significa "esvazie o conjunto" — não é o mesmo que
 * apagar o conjunto, que continua atribuído às âncoras dele.
 */
export const setFieldsetFieldsSchema = z.strictObject({
  fields: z
    .array(z.strictObject({
      fieldId: uuidObrigatorio('campo'),
      required: z.boolean('obrigatório deve ser verdadeiro ou falso').default(false),
      // `''` vira `null`: é o que o formulário manda quando o usuário limpa o
      // campo, e "padrão vazio" e "sem padrão" são a mesma coisa.
      defaultValue: z.string().trim().max(MAX_VALOR, `valor padrão: máximo de ${MAX_VALOR} caracteres`)
        .nullish()
        .transform((valor) => (valor === undefined || valor === '' ? null : valor)),
    }))
    .max(MAX_CAMPOS_POR_CONJUNTO, `máximo de ${MAX_CAMPOS_POR_CONJUNTO} campos por conjunto`),
});

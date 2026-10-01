import { z } from 'zod';

// O CONTRATO DO UPLOAD (F10, Etapa D).
//
// ═════════════════════════════════════════════════════════════════════════════
// O MAPEAMENTO VIAJA COMO **UM** CAMPO JSON, E ISSO É UMA RESTRIÇÃO DO
// TRANSPORTE, NÃO ESTILO.
//
// O `@fastify/multipart` está registrado com `fields: 10` para a aplicação
// inteira (server/app.ts) — um teto escolhido para as rotas de ANEXO, que
// recebem um arquivo e pouca coisa mais. Um mapeamento campo-a-campo
// (`col[Etiqueta]=assetTag&col[Modelo]=model&…`) estouraria esse teto num
// arquivo de 15 colunas, e o corte aconteceria no TRANSPORTE: o erro não falaria
// de mapeamento, falaria de "too many fields".
//
// Com um campo só, o teto nunca é alcançado e a validação é do zod, que diz qual
// coluna está errada.
// ═════════════════════════════════════════════════════════════════════════════

/** Teto de colunas mapeadas. O parser já recusa arquivo com mais de 60. */
const MAX_COLUNAS = 60;

export const mapeamentoSchema = z.strictObject({
  /**
   * `{ 'Cabeçalho do CSV': 'token' }`.
   *
   * `record` com chave validada: o cabeçalho vem do arquivo da pessoa, então
   * ele é texto livre — o que não é livre é o VALOR, que o
   * `validarMapeamento()` casa contra a allowlist do alvo (D67).
   */
  colunas: z
    .record(
      z.string().trim().min(1, 'cabeçalho não pode ser vazio').max(200, 'cabeçalho: máximo de 200 caracteres'),
      z.string().trim().min(1, 'campo não pode ser vazio').max(60, 'campo: máximo de 60 caracteres'),
    )
    .refine(
      (colunas) => Object.keys(colunas).length > 0,
      'mapeie ao menos uma coluna do arquivo',
    )
    .refine(
      (colunas) => Object.keys(colunas).length <= MAX_COLUNAS,
      `no máximo ${MAX_COLUNAS} colunas mapeadas`,
    ),

  /**
   * `assetTag`, `serial` ou `email` — validada contra o ALVO no use-case.
   *
   * Opcional porque `OCCUPANTS` não tem chave de uma coluna só: a identidade é o
   * par (local, colaborador), e a unicidade da ocupação aberta é do índice
   * parcial do banco. O use-case recusa a chave ausente nos outros dois alvos e
   * recusa a chave PRESENTE neste — em vez de ignorá-la em silêncio.
   */
  chave: z.string().trim().min(1, 'informe a chave de atualização').max(60).optional(),
});

export const importTargetSchema = z.enum(
  ['ASSETS', 'USERS', 'OCCUPANTS'],
  'alvo inválido: use ASSETS, USERS ou OCCUPANTS',
);

/** O que o `GET /api/imports/:id/rows` aceita além da paginação. */
export const linhasQuerySchema = z.object({
  status: z.enum(['OK', 'ERRO', 'IGNORADA'], 'situação inválida: use OK, ERRO ou IGNORADA').optional(),
});

/**
 * O mapeamento chega como STRING no corpo multipart e precisa de `JSON.parse`
 * antes do zod.
 *
 * O `try` não é zelo: um JSON malformado aqui lançaria `SyntaxError`, que o
 * error-handler traduz em 500 — e a causa (uma vírgula sobrando no mapeamento
 * que a tela montou) ficaria invisível para quem está importando.
 */
export function lerMapeamento(bruto: string | undefined) {
  if (!bruto) {
    throw new z.ZodError([{
      code: 'custom',
      path: ['mapping'],
      message: 'envie o mapeamento das colunas no campo "mapping"',
    }]);
  }

  let objeto: unknown;
  try {
    objeto = JSON.parse(bruto);
  } catch {
    throw new z.ZodError([{
      code: 'custom',
      path: ['mapping'],
      message: 'o mapeamento não é um JSON válido',
    }]);
  }

  return mapeamentoSchema.parse(objeto);
}

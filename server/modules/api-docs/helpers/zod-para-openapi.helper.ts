import { z, type ZodType } from 'zod';

/**
 * Um schema Zod como JSON Schema, do jeito que o OpenAPI lê.
 *
 * `io: 'input'` porque o contrato é o que o cliente MANDA, e é nessa metade que o
 * schema do controller trabalha — o `trim().toLowerCase()` do e-mail é uma
 * transformação que o cliente não precisa conhecer. `unrepresentable: 'any'`
 * porque o Zod 4 recusa o que o JSON Schema não expressa (um `refine`, uma
 * transformação), e a documentação tem que sair mesmo assim, só mais frouxa nesse
 * ponto: a validação de verdade nunca deixou de ser o `parse` do controller.
 */
export function zodParaJsonSchema(schema: ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  // O `$schema` (a versão do JSON Schema) fica de fora: o OpenAPI 3.0 não o aceita no corpo.
  delete jsonSchema.$schema;
  return jsonSchema;
}

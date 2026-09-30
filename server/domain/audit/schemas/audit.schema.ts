import { z } from 'zod';
import { $Enums } from '@prisma/client';
import { textoOpcional, uuidOpcional } from '../../shared/fields.schema';

// O CONTRATO DA CONFERÊNCIA.
//
// `method` NÃO está aqui, de propósito: toda auditoria que entra por HTTP é
// `MANUAL`. A `AGENTE` é escrita pelo job (D124) e não tem rota — aceitá-la no
// corpo deixaria qualquer cliente carimbar uma conferência como se o agente a
// tivesse confirmado, que é auditoria assinada pelo próprio auditado.
//
// `auditedById` também não: o ator sai da SESSÃO, nunca do JSON (D23).

export const recordAuditSchema = z.strictObject({
  result: z.enum($Enums.AuditResult, 'resultado inválido: use OK, DIVERGENTE ou NAO_LOCALIZADO'),
  /**
   * Onde o ativo foi achado. Ausente = "está onde o sistema diz".
   *
   * Não repetir o local no caso normal é o que torna a conferência de uma tela
   * inteira viável: o auditor marca o que está lá, não redigita onde está.
   */
  locationIdFound: uuidOpcional('local encontrado'),
  notes: textoOpcional('observações', 2000),
});

/**
 * A CONFERÊNCIA DE UM POSTO — N ativos, uma transação (D54).
 *
 * Duas listas e não uma com resultado por item: é o que a tela tem na mão depois
 * de alguém andar até a mesa. Quem está lá está lá; quem não apareceu não
 * apareceu. Pedir `result` por item obrigaria a tela a traduzir o mesmo gesto em
 * três palavras — e a traduzir errado, porque `OK` e `DIVERGENTE` dependem de
 * onde o ativo ESTAVA, que é informação do servidor.
 */
export const auditLocationSchema = z.strictObject({
  encontrados: z.array(z.uuid('ativo: identificador inválido'))
    .max(500, 'no máximo 500 ativos por conferência')
    .default([]),
  naoLocalizados: z.array(z.uuid('ativo: identificador inválido'))
    .max(500, 'no máximo 500 ativos por conferência')
    .default([]),
  notes: textoOpcional('observações', 2000),
}).refine(
  (corpo) => corpo.encontrados.length + corpo.naoLocalizados.length > 0,
  'informe ao menos um ativo conferido',
).refine(
  // O MESMO ativo nas duas listas é contradição, não ambiguidade para o servidor
  // resolver: ele estava na mesa ou não estava.
  (corpo) => corpo.encontrados.every((id) => !corpo.naoLocalizados.includes(id)),
  'o mesmo ativo não pode estar em encontrados e em naoLocalizados',
);

export type RecordAuditData = z.infer<typeof recordAuditSchema>;
export type AuditLocationData = z.infer<typeof auditLocationSchema>;

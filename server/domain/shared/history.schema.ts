import { z } from 'zod';

// O contrato de entrada de TODA aba Histórico — do ativo e da pessoa.
//
// Nasceu em `asset/schemas/asset.schema.ts`, com o histórico do ativo, e mudou
// para cá quando a pessoa ganhou o dela (Leva 1 do
// docs/FECHAMENTO-F2-F4-PLANO-ITAM.md): a alternativa era o domínio `user`
// importar um schema do domínio `asset`, que é seta que o ARQUITETURA.md não
// desenha — ou uma segunda cópia, que divergiria do teto original no primeiro
// ajuste.

/**
 * O teto de eventos que uma aba Histórico pede de uma vez.
 *
 * O TETO mora aqui, na borda, e o PADRÃO mora no use-case: são duas perguntas
 * diferentes — "quanto o cliente pode pedir" e "quanto a tela pede quando não
 * pede nada". Juntá-las obrigaria o schema a importar o use-case, que é a seta
 * ao contrário.
 */
export const HISTORY_MAX_LIMIT = 200;

export const historyQuerySchema = z.strictObject({
  limit: z.coerce.number('limite deve ser um número')
    .int('limite deve ser um número inteiro')
    .min(1, 'limite mínimo é 1')
    .max(HISTORY_MAX_LIMIT, `limite máximo é ${HISTORY_MAX_LIMIT}`)
    .optional(),
});

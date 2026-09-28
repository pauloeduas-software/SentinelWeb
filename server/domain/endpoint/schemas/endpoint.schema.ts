import { z } from 'zod';

// O hwid é a identidade da máquina, gerada pelo agente C# — não é uuid, então
// tem schema próprio em vez do `idParamSchema` compartilhado.
export const hwidParamSchema = z.strictObject({
  hwid: z.string('hwid é obrigatório').trim().min(1, 'hwid não pode ser vazio').max(256, 'hwid: máximo de 256 caracteres'),
});

// `toUpperCase` no schema, não no controller: a normalização faz parte do
// contrato — o agente recebe sempre o comando em maiúscula.
export const sendCommandSchema = z.strictObject({
  action: z.string('a ação é obrigatória').trim().min(1, 'a ação não pode ser vazia').max(64, 'ação: máximo de 64 caracteres').toUpperCase(),
});

/**
 * Os filtros da listagem de máquinas (F7).
 *
 * `strictObject`, e isso mudou: a versão anterior era aberta com a justificativa
 * de "ler a MESMA query string que o `parseListQuery` já consumiu". A
 * justificativa estava certa sobre o problema e errada sobre a solução — o
 * `parseListQuery` é estrito, então era ELE que recusava `?vinculo=sem` com 422,
 * e afrouxar este schema não consertava nada, só escondia typo do domínio.
 *
 * Quem resolve é o controller, separando a query pelos dois donos antes de
 * qualquer `parse`. Com cada schema recebendo só o que é seu, os dois podem ser
 * estritos — e `?vinculo=nenhum` volta a ser 422 em vez de filtro ignorado em
 * silêncio.
 */
export const endpointFilterSchema = z.strictObject({
  vinculo: z.enum(['com', 'sem'], 'vínculo inválido: use com ou sem').optional(),
  reviewState: z.enum(['UNREVIEWED', 'ALLOWED', 'BLOCKED'], 'situação inválida').optional(),
});

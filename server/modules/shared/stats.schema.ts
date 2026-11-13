import { z } from 'zod';

// O contrato de entrada dos CARTÕES (`/stats`) das três listas com filtro de
// Categoria: Computadores, Estoque e Licenças (CM). O cartão conta a lista que
// ele abre, e ela vem recortada pela categoria escolhida: sem ela, o "Em uso: 40"
// abria uma lista de 12. A busca não entra, porque o cartão conta sem ela
// (docs/referencia/telas.md, "A lista").
export const statsQuerySchema = z.strictObject({
  categoryId: z.uuid('categoria: identificador inválido').optional(),
});

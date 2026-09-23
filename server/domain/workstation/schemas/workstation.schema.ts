import { z } from 'zod';

// Contrato de entrada das rotas de posto. Só LEITURA: criar e editar um posto é
// criar e editar uma `Location`, e isso já tem dono (o CRUD de catálogo). Ver o
// porquê em `workstation.maestro.ts`.

/**
 * O `?view=` da listagem de postos.
 *
 * Separado do `parseListQuery` porque lá `view` significa LIXEIRA
 * (`active|trashed`), e aqui significa OCUPAÇÃO. São perguntas diferentes com
 * a mesma palavra, e o `strictObject` do core recusaria `todos` de qualquer
 * jeito — o controller tira esta chave da query antes de passar o resto adiante.
 *
 * `strictObject` também aqui: `?vew=vagos` (typo) usaria o padrão em silêncio e
 * a tela mostraria todos os postos achando que eram só os vagos.
 */
export const workstationViewQuerySchema = z.strictObject({
  view: z
    .enum(['todos', 'vagos', 'ocupados'], 'view inválida: use todos, vagos ou ocupados')
    .default('todos'),
});

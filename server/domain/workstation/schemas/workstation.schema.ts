import { z } from 'zod';
import { nomeObrigatorio, textoOpcional, uuidObrigatorio, versaoLida } from '../../shared/fields.schema';

// Contrato de entrada das rotas de posto.
//
// `strictObject` como no catálogo: campo desconhecido é 422, nunca ignorado.
// O posto FICA numa localização — obrigatória na criação; na edição, só se
// mudar. Sem `isActive`: o posto não se desativa (AN).
export const createWorkstationSchema = z.strictObject({
  name: nomeObrigatorio(),
  locationId: uuidObrigatorio('localização'),
  notes: textoOpcional('notas', 2_000),
});

export const updateWorkstationSchema = z.strictObject({
  name: nomeObrigatorio().optional(),
  locationId: uuidObrigatorio('localização').optional(),
  notes: textoOpcional('notas', 2_000),
  updatedAt: versaoLida,
});

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

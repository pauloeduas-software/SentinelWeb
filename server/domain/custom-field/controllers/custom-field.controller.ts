import type { FastifyRequest } from 'fastify';
import { prisma } from '../../../core/database/prismaClient';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { setFieldsetFieldsSchema } from '../schemas/custom-field.schema';
import { listFieldsetFields } from '../use-cases/list-fieldset-fields.usecase';
import { setFieldsetFields } from '../use-cases/set-fieldset-fields.usecase';

// Só HTTP. Sem try/catch: o `parse` do schema rejeita e a rejeição cai no
// errorHandler, que devolve 422 com o campo que falhou.

export const customFieldController = {
  /**
   * Os campos que viram COLUNA na tabela de ativos (`showInListView`).
   *
   * Rota própria, e não `?showInListView=true` na listagem do catálogo, por dois
   * motivos: a listagem é paginada com teto de 100 (e a tela precisa de todos),
   * e o que ela devolve é a linha inteira do cadastro — a tabela de ativos só
   * precisa de `slug` e `name`.
   *
   * É o mesmo raciocínio do `/options` do catálogo, aplicado a outra pergunta.
   */
  async listView() {
    return prisma.customField.findMany({
      // `encrypted: false` e o `TEXTAREA` de fora são redundantes com as duas
      // guardas do `beforeWrite` (campo cifrado e texto de várias linhas não
      // podem ter `showInListView`) e entram assim mesmo: a guarda vale para o
      // que passou pela API, e uma linha gravada por seed ou por `psql` não
      // passou. Uma coluna de `••••••` repetido em toda linha — ou uma de
      // observações de dois mil caracteres — é o tipo de defeito que ninguém
      // reporta.
      where: { showInListView: true, encrypted: false, element: { not: 'TEXTAREA' } },
      orderBy: { name: 'asc' },
      select: { slug: true, name: true, element: true, format: true },
    });
  },

  /** A composição de um conjunto, com o `quebrariam` de cada campo (D61). */
  async fields(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listFieldsetFields(id);
  },

  /** A composição inteira, gravada de uma vez. Ver o use-case. */
  async setFields(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { fields } = setFieldsetFieldsSchema.parse(request.body ?? {});
    await setFieldsetFields(id, fields, atorDaRequisicao(request));
    // Devolve a composição RELIDA, e não `{ success: true }`: os `quebrariam`
    // mudam depois de gravar (o campo que acabou de virar obrigatório passa a
    // contar zero), e a tela precisa do estado novo sem uma segunda requisição.
    return listFieldsetFields(id);
  },
};

import { AppError } from '../../../core/errors/app-error';
import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { createCategorySchema, updateCategorySchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec, ClienteCatalogo } from './catalog-spec.types';

// O ativo NÃO tem `categoryId`: a categoria dele é a do modelo. Por isso o uso
// se conta em dois saltos — modelos desta categoria, e ativos desses modelos.
// O item de estoque aponta direto.
//
// `INCLUINDO_LIXEIRA` no ativo e no item: os dois continuam presos à categoria,
// e trocar o tipo dela por baixo deles mudaria a semântica de um registro que
// ainda pode voltar. `assetModel` não precisa do mesmo cuidado: não tem lixeira.
const contarUsos = async (client: ClienteCatalogo, id: string) => {
  const [modelos, ativos, itens] = await Promise.all([
    client.assetModel.count({ where: { categoryId: id } }),
    client.asset.count({ where: { model: { categoryId: id }, ...INCLUINDO_LIXEIRA } }),
    client.stockItem.count({ where: { categoryId: id, ...INCLUINDO_LIXEIRA } }),
  ]);
  return modelos + ativos + itens;
};

export const categorySpec: CatalogSpec = {
  slug: 'categories',
  entityType: 'Category',
  rotulo: 'categoria',

  delegate: (client) => client.category as unknown as CatalogDelegate,
  createSchema: createCategorySchema,
  updateSchema: updateCategorySchema,

  select: {
    id: true, name: true, type: true, color: true, createdAt: true,
  },
  sortable: ['name', 'type', 'createdAt'],
  defaultSort: 'name',
  searchable: ['name'],
  audited: ['name', 'type', 'color'],

  // O `<select>` de cada formulário pede só as do SEU tipo; sem isto ele
  // ofereceria duas linhas de mesmo nome e tipos diferentes.
  optionFilter: { campo: 'type', valores: ['ASSET', 'LICENSE', 'STOCK'] },

  countUsages: contarUsos,

  // Trocar o tipo de uma categoria em uso levaria junto tudo que aponta para
  // ela: uma categoria de ATIVO virando LICENÇA muda a semântica dos registros
  // existentes sem tocar em nenhum deles. Mesma guarda do delete.
  async beforeWrite(client, id, data) {
    if (!id || data.type === undefined) return;

    const atual = await client.category.findUnique({ where: { id }, select: { type: true } });
    if (!atual || atual.type === data.type) return;

    const usos = await contarUsos(client, id);
    if (usos > 0) {
      throw new AppError(
        `Não é possível mudar o tipo: categoria em uso por ${usos} ${usos === 1 ? 'registro' : 'registros'}.`,
        409,
        { emUso: usos },
      );
    }
  },
};

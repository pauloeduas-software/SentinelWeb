import { createCustomFieldsetSchema, updateCustomFieldsetSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec, ClienteCatalogo } from './catalog-spec.types';

// CONJUNTO DE CAMPOS — o nome, que é tudo o que a tabela guarda.
//
// A COMPOSIÇÃO (quais campos, em que ordem, quais obrigatórios) NÃO está aqui:
// ela mora em `custom_fieldset_fields` e tem rota própria em
// `server/domain/custom-field/`, porque ordem e obrigatoriedade têm regra — e
// regra mora em use-case, não em spec (D64).
//
// A divisão não é estética. O `PUT /api/custom-fieldsets/:id` genérico grava um
// `data` plano; reordenar cinco vínculos é uma transação com cinco `update`, e
// promover um campo a obrigatório precisa contar quantos ativos ficariam
// inválidos antes de deixar. Nenhuma das duas coisas é expressável como campo.

/**
 * Quem aponta para um conjunto são as DUAS âncoras do D58 — e só elas.
 *
 * Os vínculos com campos NÃO contam, e isso é a diferença entre referência e
 * composição: a lista de campos é *parte* do conjunto (`onDelete: Cascade`), não
 * alguém que o usa. Contá-los faria um conjunto recém-montado e nunca atribuído
 * a categoria nenhuma ser indelével — 409 "em uso por 5 registros" para algo que
 * ninguém usa.
 */
const contarUsos = async (client: ClienteCatalogo, id: string) => {
  const [categorias, modelos] = await Promise.all([
    client.category.count({ where: { customFieldsetId: id } }),
    client.assetModel.count({ where: { customFieldsetId: id } }),
  ]);
  return categorias + modelos;
};

export const customFieldsetSpec: CatalogSpec = {
  slug: 'custom-fieldsets',
  entityType: 'CustomFieldset',
  rotulo: 'conjunto de campos',

  delegate: (client) => client.customFieldset as unknown as CatalogDelegate,
  createSchema: createCustomFieldsetSchema,
  updateSchema: updateCustomFieldsetSchema,

  // `_count` dos vínculos vem embutido porque a tabela mostra "quantos campos"
  // — e uma consulta por linha seria N+1 na tela de administração.
  select: {
    id: true, name: true, createdAt: true,
    _count: { select: { fields: true, categories: true, assetModels: true } },
  },
  sortable: ['name', 'createdAt'],
  defaultSort: 'name',
  searchable: ['name'],
  // Só o nome: `_count` é derivado e não é campo editável. Pôr um agregado no
  // diff faria o histórico registrar "alterado" a cada campo que entrasse na
  // composição, que já tem log próprio.
  audited: ['name'],

  countUsages: contarUsos,
};

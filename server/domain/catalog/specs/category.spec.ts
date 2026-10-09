import { AppError } from '../../../core/errors/app-error';
import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { createCategorySchema, updateCategorySchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec, ClienteCatalogo } from './catalog-spec.types';

// O ativo NÃO tem `categoryId`: a categoria dele é a do modelo. Por isso o uso
// se conta em dois saltos — modelos desta categoria, e ativos desses modelos.
//
// OS TRÊS DE ESTOQUE SÃO O SALTO ÚNICO: `Accessory`, `Consumable` e `Component`
// apontam direto. Eles entraram aqui na F5, e a ausência deles era um furo de
// verdade — não uma mensagem feia:
//
//   `beforeWrite` deixava passar o tipo de uma categoria usada SÓ por acessórios
//   indo de `ACCESSORY` para `ASSET`, porque a contagem não os via. O acessório
//   terminava numa categoria de tipo `ASSET` — exatamente o estado que
//   `assert-stock-references.usecase.ts` recusa com 422 na criação, e que a tela
//   evita com o `optionFilter`. A guarda existia na porta do ITEM e não na porta
//   da CATEGORIA, e a de trás estava aberta.
//
// `INCLUINDO_LIXEIRA` nos três: as FKs deles são `Restrict`, e o Postgres não
// distingue linha viva de linha na lixeira. Sem ele a contagem devolveria 0, o
// `DELETE` seguiria, e o banco recusaria com P2003 — 409 genérico "Registro está
// em uso por outro cadastro", sem dizer por quantos nem por quê.
//
// O ativo na lixeira conta pelo mesmo motivo — ele continua preso ao modelo, e
// trocar o tipo da categoria por baixo dele mudaria a semântica de um registro
// que ainda pode voltar. `assetModel` não precisa do mesmo cuidado: não tem
// lixeira.
const contarUsos = async (client: ClienteCatalogo, id: string) => {
  const [modelos, ativos, acessorios, consumiveis, componentes] = await Promise.all([
    client.assetModel.count({ where: { categoryId: id } }),
    client.asset.count({ where: { model: { categoryId: id }, ...INCLUINDO_LIXEIRA } }),
    client.accessory.count({ where: { categoryId: id, ...INCLUINDO_LIXEIRA } }),
    client.consumable.count({ where: { categoryId: id, ...INCLUINDO_LIXEIRA } }),
    client.component.count({ where: { categoryId: id, ...INCLUINDO_LIXEIRA } }),
  ]);
  return modelos + ativos + acessorios + consumiveis + componentes;
};

export const categorySpec: CatalogSpec = {
  slug: 'categories',
  entityType: 'Category',
  rotulo: 'categoria',

  delegate: (client) => client.category as unknown as CatalogDelegate,
  createSchema: createCategorySchema,
  updateSchema: updateCategorySchema,

  select: {
    id: true, name: true, type: true, color: true,
    requireAcceptance: true, eulaText: true, checkinEmail: true, createdAt: true,
  },
  sortable: ['name', 'type', 'createdAt'],
  defaultSort: 'name',
  searchable: ['name'],
  audited: ['name', 'type', 'color', 'requireAcceptance', 'eulaText', 'checkinEmail'],

  // O `<select>` do formulário de ativo pede só as de ATIVO; sem isto ele
  // ofereceria duas linhas de mesmo nome e tipos diferentes.
  optionFilter: { campo: 'type', valores: ['ASSET', 'ACCESSORY', 'CONSUMABLE', 'COMPONENT', 'LICENSE'] },

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

import { AppError } from '../../../core/errors/app-error';
import { createDepreciationSchema, updateDepreciationSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec } from './catalog-spec.types';

export const depreciationSpec: CatalogSpec = {
  slug: 'depreciations',
  entityType: 'Depreciation',
  rotulo: 'regra de depreciação',

  delegate: (client) => client.depreciation as unknown as CatalogDelegate,
  createSchema: createDepreciationSchema,
  updateSchema: updateDepreciationSchema,

  // `floorValue` é Decimal: sai na resposta como STRING ("1234.5"), e é assim
  // que o frontend o tipa. Formatar é da tela.
  select: { id: true, name: true, months: true, floorValue: true, floorType: true, createdAt: true },
  sortable: ['name', 'months', 'createdAt'],
  defaultSort: 'name',
  searchable: ['name'],
  audited: ['name', 'months', 'floorValue', 'floorType'],

  // A depreciação passa a ser referenciada pelo modelo/ativo na F8.
  countUsages: () => Promise.resolve(0),

  /**
   * Piso em percentual não passa de 100%.
   *
   * A validação não cabe no schema porque é entre DOIS campos e a edição é
   * parcial: quem manda só `floorValue` não diz qual é o `floorType`, e quem
   * manda só `floorType` não diz qual é o valor. O estado final é o que importa,
   * e ele só existe aqui, com a linha atual em mãos.
   *
   * Sem isto, `floorValue: 9999999999.99` com `floorType: PERCENT` era aceito —
   * e na F8 viraria um valor contábil com piso acima do preço de compra.
   */
  async beforeWrite(client, id, data) {
    const atual = id
      ? await client.depreciation.findUnique({
          where: { id },
          select: { floorValue: true, floorType: true },
        })
      : null;

    const floorType = data.floorType ?? atual?.floorType;
    const floorValue = data.floorValue ?? atual?.floorValue;
    if (floorType !== 'PERCENT' || floorValue == null) return;

    // `floorValue` é string vinda do schema na escrita e `Decimal` quando vem do
    // banco; `Number` atende os dois, e aqui é só comparação — o valor que vai
    // para a coluna continua sem passar por ponto flutuante.
    if (Number(floorValue) > 100) {
      throw new AppError('Valor residual em percentual não pode passar de 100%.', 422);
    }
  },
};

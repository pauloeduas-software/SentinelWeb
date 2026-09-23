import { AppError } from '../../../core/errors/app-error';
import type { ClienteEstoque, StockKindSpec } from '../helpers/stock-kind.helper';

// As referências de um item de estoque existem? E a categoria é do TIPO certo?
//
// POR QUE CONFERIR ANTES EM VEZ DE DEIXAR A FK FALHAR: o `onDelete: Restrict`
// das quatro FKs faz o Postgres recusar um id inexistente com P2003, e o
// error-handler traduz TODO P2003 em 409 "Registro está em uso por outro
// cadastro" — que não é nem o status nem a frase certa para "esse fornecedor
// não existe". Conferir custa uma consulta e devolve 404 com o nome do que
// faltou. Mesmo desenho do `assertAlvoExiste` do checkout (F4).

export interface ReferenciasDoItem {
  categoryId?: string;
  manufacturerId?: string | null;
  supplierId?: string | null;
  locationId?: string | null;
}

/**
 * A categoria precisa ser do tipo do item: `ACCESSORY` para acessório,
 * `CONSUMABLE` para consumível, `COMPONENT` para componente.
 *
 * NADA NO BANCO IMPEDE o contrário — a FK só garante que a linha existe, não o
 * `type` dela. Sem esta guarda, um acessório de categoria "Notebook (ASSET)"
 * entra sem erro nenhum e reaparece na tela agrupado com equipamento. É o mesmo
 * tipo de contradição que a auditoria da F1 encontrou em "Em Uso" tipado
 * `DEPLOYABLE`: um rótulo declarado dizendo uma coisa e o uso dizendo outra.
 *
 * A tela tem a sua própria proteção — o `optionFilter` da spec de categoria
 * (D11) —, mas tela não é regra: quem chama a API direto passaria por cima.
 */
export async function assertReferenciasDoItem(
  client: ClienteEstoque,
  spec: StockKindSpec,
  dados: ReferenciasDoItem,
): Promise<void> {
  if (dados.categoryId) {
    const categoria = await client.category.findUnique({
      where: { id: dados.categoryId },
      select: { id: true, name: true, type: true },
    });
    if (!categoria) throw new AppError('Categoria não encontrada.', 404);

    // 422 e não 409: o corpo enviado é que está incoerente, como um `targetType`
    // que não casa com a FK preenchida no checkout da F4.
    if (categoria.type !== spec.categoryType) {
      throw new AppError(
        `A categoria "${categoria.name}" é do tipo ${categoria.type} e não serve a um ${spec.rotulo}.`,
        422,
        { categoryType: categoria.type, esperado: spec.categoryType },
      );
    }
  }

  // As três opcionais. Só conferidas quando vêm PREENCHIDAS: `null` explícito é
  // "limpar o campo", que é operação legítima e não precisa de consulta.
  if (dados.manufacturerId) {
    const fabricante = await client.manufacturer.findUnique({
      where: { id: dados.manufacturerId }, select: { id: true },
    });
    if (!fabricante) throw new AppError('Fabricante não encontrado.', 404);
  }

  if (dados.supplierId) {
    const fornecedor = await client.supplier.findUnique({
      where: { id: dados.supplierId }, select: { id: true },
    });
    if (!fornecedor) throw new AppError('Fornecedor não encontrado.', 404);
  }

  if (dados.locationId) {
    const local = await client.location.findUnique({
      where: { id: dados.locationId }, select: { id: true },
    });
    if (!local) throw new AppError('Localização não encontrada.', 404);
  }
}

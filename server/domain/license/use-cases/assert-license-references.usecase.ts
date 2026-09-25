import { AppError } from '../../../core/errors/app-error';
import type { ClienteLicenca } from '../helpers/license-seats.helper';

// As referências da licença existem? E a categoria é do TIPO `LICENSE`?
//
// POR QUE CONFERIR ANTES EM VEZ DE DEIXAR A FK FALHAR: o `onDelete: Restrict`
// das três FKs faz o Postgres recusar um id inexistente com P2003, e o
// error-handler traduz TODO P2003 em 409 "Registro está em uso por outro
// cadastro" — que não é nem o status nem a frase certa para "esse fornecedor
// não existe". Conferir custa uma consulta e devolve 404 com o nome do que
// faltou. Mesmo desenho do `assertReferenciasDoItem` da F5.

export interface ReferenciasDaLicenca {
  categoryId?: string;
  manufacturerId?: string | null;
  supplierId?: string | null;
}

/**
 * A categoria precisa ser do tipo `LICENSE`.
 *
 * NADA NO BANCO IMPEDE o contrário — a FK só garante que a linha existe, não o
 * `type` dela. Sem esta guarda, uma licença de categoria "Notebook (ASSET)"
 * entra sem erro nenhum e reaparece na tela agrupada com equipamento. É o mesmo
 * tipo de contradição que a auditoria da F1 encontrou em "Em Uso" tipado
 * `DEPLOYABLE`.
 *
 * A tela tem a sua própria proteção — o `optionFilter` da spec de categoria
 * (D11) —, mas tela não é regra: quem chama a API direto passaria por cima.
 */
export async function assertReferenciasDaLicenca(
  client: ClienteLicenca,
  dados: ReferenciasDaLicenca,
): Promise<void> {
  if (dados.categoryId) {
    const categoria = await client.category.findUnique({
      where: { id: dados.categoryId },
      select: { id: true, name: true, type: true },
    });
    if (!categoria) throw new AppError('Categoria não encontrada.', 404);

    // 422 e não 409: o corpo enviado é que está incoerente.
    if (categoria.type !== 'LICENSE') {
      throw new AppError(
        `A categoria "${categoria.name}" é do tipo ${categoria.type} e não serve a uma licença.`,
        422,
        { categoryType: categoria.type, esperado: 'LICENSE' },
      );
    }
  }

  // As duas opcionais. Só conferidas quando vêm PREENCHIDAS: `null` explícito é
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
}

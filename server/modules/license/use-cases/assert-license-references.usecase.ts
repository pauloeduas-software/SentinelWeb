import { AppError } from '../../../infra/errors/app-error';
import { lerCategoriaTravada, lerFabricanteTravado } from '../../catalog/helpers/catalog-lock.helper';
import type { ClienteQueTrava } from '../../person/use-cases/lock-person.usecase';
import type { ClienteLicenca } from './count-license-checkouts.usecase';

// As referências da licença existem? E a categoria é do TIPO `LICENSE`?
//
// POR QUE CONFERIR ANTES EM VEZ DE DEIXAR A FK FALHAR: o `onDelete: Restrict`
// das duas FKs faz o Postgres recusar um id inexistente com P2003, e o
// error-handler traduz TODO P2003 em 409 "Registro está em uso por outro
// cadastro" — que não é nem o status nem a frase certa para "esse fabricante
// não existe". Conferir custa uma consulta e devolve 404 com o nome do que
// faltou. Mesmo desenho do `assertCategoriaDeEstoque` do estoque.

interface ReferenciasDaLicenca {
  categoryId?: string;
  manufacturerId?: string | null;
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
  client: ClienteLicenca & ClienteQueTrava,
  dados: ReferenciasDaLicenca,
): Promise<void> {
  if (dados.categoryId) {
    // `FOR SHARE`: a troca de tipo da categoria trava a linha antes de contar
    // as licenças, e esta leitura espera por ela em vez de aprovar o tipo velho.
    const categoria = await lerCategoriaTravada(client, dados.categoryId);
    if (!categoria) throw new AppError('Categoria não encontrada.', 404);

    // 422 e não 409: o corpo enviado é que está incoerente.
    if (categoria.type !== 'LICENSE') {
      throw new AppError(
        `A categoria "${categoria.name}" é do tipo ${categoria.type} e não serve a uma licença.`,
        422,
      );
    }
  }

  // As duas opcionais. Só conferidas quando vêm PREENCHIDAS: `null` explícito é
  // "limpar o campo", que é operação legítima e não precisa de consulta.
  if (dados.manufacturerId) {
    const fabricante = await lerFabricanteTravado(client, dados.manufacturerId);
    if (!fabricante) throw new AppError('Fabricante não encontrado.', 404);
  }
}

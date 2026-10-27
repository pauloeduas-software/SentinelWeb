import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { escaparCuringas } from '../../shared/busca.helper';
import { buildSnapshot } from '../../shared/diff.helper';
import {
  assertEscolhaAtiva, assertLocalRecebe, lerCategoriaTravada,
} from '../../catalog/helpers/catalog-lock.helper';
import type { ClienteQueTrava } from '../../person/use-cases/lock-person.usecase';
import { comContagem, SEM_USO, type ClienteEstoque } from '../helpers/stock-balance.helper';
import { CAMPOS_AUDITADOS_DO_ITEM, STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';
import type { CreateStockItemInput } from '../schemas/stock.schema';

/**
 * A categoria do item tem que ser do tipo ESTOQUE ou COMPONENTE — e é ela que
 * decide para onde o item vai (AI): o de Estoque a colaborador ou posto, o de
 * Componente só a computador.
 *
 * O banco não impede — a FK aceita qualquer categoria —, e é o `type` que
 * separa: um item de estoque numa categoria de ATIVO é o mesmo erro que "Em
 * Uso" tipado DEPLOYABLE foi na F1. 422 e não 404: a categoria existe, o tipo
 * dela é que não serve.
 *
 * Lida `FOR SHARE`: a troca de tipo da categoria trava a linha antes de contar
 * os itens, e esta leitura espera por ela em vez de aprovar o tipo velho.
 * Devolve o tipo, que a edição compara com o de antes.
 */
export async function assertCategoriaDeEstoque(
  client: ClienteEstoque & ClienteQueTrava,
  categoryId: string,
  /** A categoria de ANTES, na edição: desativada só é recusada quando muda. */
  categoriaAtual?: string,
): Promise<string> {
  const categoria = await lerCategoriaTravada(client, categoryId);
  if (!categoria) throw new AppError('Categoria não encontrada.', 404);
  if (categoria.type !== 'STOCK' && categoria.type !== 'COMPONENT') {
    throw new AppError(
      `A categoria de um item de estoque precisa ser do tipo Estoque ou Componente, e "${categoria.name}" não é.`,
      422,
    );
  }
  if (categoryId !== categoriaAtual) assertEscolhaAtiva(categoria, { rotulo: 'A categoria', feminino: true });
  return categoria.type;
}

/**
 * O nome é único entre TODOS os itens, desativados inclusive: o item que volta
 * a ser comprado se reativa, e o histórico dele continua junto. Conferir antes
 * é o que transforma o P2002 cru num 409 que diz o nome — e o que fazer.
 */
export async function assertNomeLivre(client: ClienteEstoque, name: string, ignorarId?: string): Promise<void> {
  // Sem distinguir maiúsculas, como nas Configurações (`nome-unico.helper.ts`):
  // "mouse usb" é o "Mouse USB" com outra grafia. O `insensitive` vira ILIKE, e
  // lá `%` e `_` são curingas — por isso o escape.
  const outro = await client.stockItem.findFirst({
    where: {
      name: { equals: escaparCuringas(name), mode: 'insensitive' },
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
    },
    select: { name: true, isActive: true },
  });
  if (!outro) return;
  throw new AppError(
    outro.isActive
      ? `Já existe um item de estoque chamado "${outro.name}".`
      : `Já existe um item de estoque chamado "${outro.name}", desativado. Reative-o em vez de cadastrar outro.`,
    409,
  );
}

export async function createStockItem(data: CreateStockItemInput, ator: Ator) {
  return prisma.$transaction(async (tx) => {
    await assertCategoriaDeEstoque(tx, data.categoryId);
    await assertNomeLivre(tx, data.name);
    // O local de guarda: existe (404) e não foi desativado (409) — a mesma
    // porta de quem entrega ou guarda ativo (`assertLocalRecebe`).
    if (data.locationId) await assertLocalRecebe(tx, data.locationId, 'estoque novo');

    const item = await tx.stockItem.create({
      data: {
        name: data.name,
        categoryId: data.categoryId,
        qty: data.qty,
        locationId: data.locationId ?? null,
        notes: data.notes ?? null,
      },
      select: STOCK_ITEM_SELECT,
    });

    // O total entra na auditoria, no retrato do cadastro, como a quantidade
    // comprada da licença. O histórico da tela é só entregas e devoluções.
    await recordAudit(tx, {
      entityType: 'StockItem',
      entityId: item.id,
      entityLabel: item.name,
      action: 'CREATE',
      changes: buildSnapshot(item, CAMPOS_AUDITADOS_DO_ITEM),
    }, ator);

    // COM A CONTA, como a listagem e o detalhe: uma forma só de item na API.
    // Zero em uso por construção — nada saiu de um item que acabou de nascer.
    return comContagem(item, SEM_USO);
  });
}

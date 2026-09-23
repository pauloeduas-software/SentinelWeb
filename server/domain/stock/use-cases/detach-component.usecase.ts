import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { travarItemOuFalhar } from '../helpers/stock-balance.helper';
import { componentSpec } from '../helpers/stock-kind.helper';
import { COMPONENT_ASSET_SELECT } from '../helpers/stock-select.helper';
import type { DetachComponentData } from '../schemas/component.schema';

// A RETIRADA, TOTAL OU PARCIAL — e a decisão que ela carrega (D38).
//
// ─────────────────────────────────────────────────────────────────────────────
// DEVOLUÇÃO PARCIAL DIVIDE A LINHA. Retirar 2 de 4 pentes:
//
//   antes    [ assignedQty: 4, detachedAt: null ]
//   depois   [ assignedQty: 4, detachedAt: agora ]      ← fechada
//            [ assignedQty: 2, detachedAt: null  ]      ← o que CONTINUA dentro
//
// A alternativa — decrementar `assignedQty` para 2 na linha aberta — é uma
// linha de código a menos e apaga a resposta de "quantos pentes estavam nessa
// máquina em março?". A soma das linhas ABERTAS continua sendo o estado atual
// (o que a tela mostra) e a SEQUÊNCIA continua sendo o histórico (o que a
// auditoria pede).
//
// O PREÇO, DECLARADO — e PAGO: lido cru, o histórico pareceria dizer "instalou
// 4, retirou 4, instalou 2". Quem paga é a movimentação, rotulando o par como
// *parcial: 2 de 4* e não emitindo a instalação da sucessora — aquelas 2
// unidades nunca voltaram ao estoque.
//
// E o que torna isso possível é o `predecessorId` gravado abaixo. O plano dizia
// que o rótulo seria "trabalho de apresentação, não de schema"; não era: nada
// no banco ligava a linha fechada à sucessora, e a única alternativa era casar
// as duas por TIMESTAMP — heurística que quebra em silêncio no primeiro caminho
// que grave as datas de outro jeito. UMA coluna de vínculo é o que a promessa
// custava.
//
// E o `attachedAt` da sucessora é AGORA, não o da original. Ela é uma linha
// nova de verdade, e a ordenação por `attachedAt` — que é como a aba monta a
// sequência — ficaria empatada se as duas tivessem a mesma data, com o par
// aparecendo em ordem instável entre dois refreshes idênticos. O que se perde é
// "estes 2 estão aqui desde março", e isso continua legível na linha fechada
// logo acima.
// ─────────────────────────────────────────────────────────────────────────────

export async function detachComponent(
  instalacaoId: string,
  data: DetachComponentData,
  actorId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    // A linha da instalação primeiro, só para descobrir QUAL componente travar
    // — o `where` da trava precisa do id do pai, que só esta leitura tem.
    const atual = await tx.componentAsset.findUnique({
      where: { id: instalacaoId },
      select: { id: true, componentId: true, assetId: true, assignedQty: true, detachedAt: true },
    });
    if (!atual) throw new AppError('Nenhuma instalação com este identificador.', 404);

    // A TRAVA DA LINHA-PAI. Necessária mesmo numa operação que só devolve: a
    // retirada parcial CRIA uma linha aberta, e sem a trava ela entraria no
    // meio da contagem de uma instalação simultânea — que leria o saldo de
    // antes da divisão e o gravaria como se fosse depois.
    await travarItemOuFalhar(tx, 'COMPONENT', componentSpec.rotulo, atual.componentId);

    // Releitura DEPOIS da trava: a leitura acima serviu para achar o pai, e
    // entre ela e o lock outra transação pode ter fechado esta mesma linha.
    const instalacao = await tx.componentAsset.findUniqueOrThrow({
      where: { id: instalacaoId },
      select: { id: true, componentId: true, assetId: true, assignedQty: true, detachedAt: true },
    });

    if (instalacao.detachedAt) {
      throw new AppError('Esta instalação já foi retirada.', 409, {
        detachedAt: instalacao.detachedAt.toISOString(),
      });
    }

    // Ausente = retira tudo. É o caso comum, e é o único em que não nasce
    // sucessora.
    const retirada = data.qty ?? instalacao.assignedQty;

    if (retirada > instalacao.assignedQty) {
      throw new AppError(
        `Esta instalação tem ${instalacao.assignedQty} unidade(s); não é possível retirar ${retirada}.`,
        422,
        { assignedQty: instalacao.assignedQty, pedido: retirada },
      );
    }

    const agora = new Date();

    await tx.componentAsset.update({
      where: { id: instalacao.id },
      // `detachedAt` e NADA mais na quantidade: a linha fechada guarda quantas
      // unidades estavam instaladas, que é o dado que a auditoria lê.
      //
      // A observação vai em `detachNotes`, COLUNA PRÓPRIA. Escrevê-la em `notes`
      // — como esta linha fazia — apagava a observação da INSTALAÇÃO: "upgrade
      // de 8 para 16 GB" sumia no dia em que alguém registrava "2 pentes com
      // defeito", e a movimentação, que lê a mesma coluna nos dois eventos,
      // passava a mostrar o texto da retirada na linha da entrada. É o par
      // `checkoutNotes`/`checkinNotes` do acessório, que nunca teve o problema.
      data: { detachedAt: agora, detachedById: actorId, detachNotes: data.notes ?? null },
    });

    const restante = instalacao.assignedQty - retirada;
    const sucessora = restante === 0 ? null : await tx.componentAsset.create({
      data: {
        componentId: instalacao.componentId,
        assetId: instalacao.assetId,
        assignedQty: restante,
        attachedAt: agora,
        // O VÍNCULO COM A ANTECESSORA, gravado. É ele que deixa a aba rotular o
        // par como "parcial: 2 de 4" sem casar as duas por timestamp — e sem o
        // vínculo, a promessa do D38 dependia de uma heurística de data que
        // quebra em silêncio.
        predecessorId: instalacao.id,
        // A observação da instalação original NÃO desce para a sucessora: ela
        // descrevia a entrada das 4 unidades, e repeti-la faria a linha nova
        // parecer uma instalação que nunca houve.
        attachedById: actorId,
      },
      select: COMPONENT_ASSET_SELECT,
    });

    const changes = {
      instalacaoId: instalacao.id,
      componentId: instalacao.componentId,
      assetId: instalacao.assetId,
      retirada,
      de: instalacao.assignedQty,
      // O id da sucessora é o que liga o par para a aba rotular "devolução
      // parcial: 2 de 4" sem adivinhar por data.
      sucessoraId: sucessora?.id ?? null,
    };

    await recordActivity(tx, {
      entityType: componentSpec.entityType,
      entityId: instalacao.componentId,
      action: 'UNINSTALL',
      changes,
    }, actorId);

    await recordActivity(tx, {
      entityType: 'Asset',
      entityId: instalacao.assetId,
      action: 'UNINSTALL',
      changes,
    }, actorId);

    return {
      fechada: await tx.componentAsset.findUniqueOrThrow({
        where: { id: instalacao.id },
        select: COMPONENT_ASSET_SELECT,
      }),
      /** A linha que continua aberta na retirada PARCIAL; `null` na total. */
      sucessora,
    };
  });
}

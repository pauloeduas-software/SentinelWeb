import { AppError } from '../../../core/errors/app-error';
import { createLogger } from '../../../core/logger/logger';
import { checkoutAsset, type CheckoutData } from './checkout-asset.usecase';

const logger = createLogger('assignment.bulk-checkout');

// ENTREGA EM MASSA — N ativos para UM alvo (D31).
//
// É o kit de onboarding: notebook, dock, monitor, teclado, mouse e headset
// entregues de uma vez à pessoa — ou, no caso que o posto torna trivial, à Mesa
// 1 inteira, uma `Assignment` por ativo, todas com o mesmo alvo.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE ISTO É POR LINHA, E A AÇÃO EM MASSA DA F2 É TUDO-OU-NADA
//
// Não é inconsistência: são duas operações de natureza diferente.
//
// A edição em massa da F2 (D21) é UMA intenção aplicada a N linhas — "mova
// estes 40 ativos para a filial Recife". Metade aplicada é um estado que
// ninguém pediu, e ninguém consegue nem descrever depois: 18 mudaram, 22 não,
// e a tela não sabe quais. Ali, tudo ou nada é a única resposta honesta.
//
// Aqui são N ENTREGAS INDEPENDENTES. Cada ativo tem o seu próprio estado e o
// seu próprio motivo para falhar — um já está com outra pessoa, outro está como
// "Em manutenção", um terceiro foi para a lixeira enquanto a tela estava aberta.
// Um kit de 8 itens em que 1 falha ainda entrega 7, e refazer os 7 à mão é pior
// do que ler um relatório de uma linha. Desfazer os 7 seria, além de pior,
// falso: as entregas aconteceram no mundo físico antes de virarem linha.
//
// Por isso cada ativo roda na SUA transação (`checkoutAsset` abre a dele) e o
// retorno é um RELATÓRIO, não um erro.
// ─────────────────────────────────────────────────────────────────────────────

export interface BulkCheckoutData extends CheckoutData {
  assetIds: string[];
}

export interface EntregaFeita {
  assetId: string;
  assetTag: string;
  assignmentId: string;
}

export interface EntregaRecusada {
  assetId: string;
  /** A frase que o use-case de entrega escreveu — a mesma do 409 individual. */
  erro: string;
}

export interface RelatorioEntregaEmLote {
  /** Quantos ativos foram PEDIDOS (já sem repetição). */
  total: number;
  ok: EntregaFeita[];
  falhas: EntregaRecusada[];
}

/**
 * O motivo que vai para o relatório.
 *
 * Só `AppError` tem texto escrito para ser lido por gente — é a regra do
 * `docs/ARQUITETURA.md`: `error.message` de banco ou de biblioteca nunca vai
 * para o cliente. Qualquer outra coisa vira uma frase genérica AQUI e o erro
 * completo vai para o log, com o id do ativo, para ser depurável depois.
 */
function motivoDaRecusa(assetId: string, erro: unknown): string {
  if (erro instanceof AppError) return erro.message;

  logger.error('[BulkCheckout] Falha inesperada na entrega de um ativo.', erro, { assetId });
  return 'Falha inesperada ao entregar este ativo.';
}

export async function bulkCheckout(
  data: BulkCheckoutData,
  /** Quem entregou (D23) — o MESMO ator nas N linhas: foi um clique só. */
  actorId: string | null = null,
): Promise<RelatorioEntregaEmLote> {
  const { assetIds, ...entrega } = data;

  // Repetido na seleção (dois cliques na mesma linha, ou o mesmo id vindo de
  // duas páginas da listagem) viraria uma falha "já está entregue" causada pela
  // própria operação — um erro que o usuário não cometeu e não consegue
  // corrigir. A ordem da primeira ocorrência é preservada: o relatório sai na
  // ordem em que a tela mandou.
  const ids = [...new Set(assetIds)];

  const ok: EntregaFeita[] = [];
  const falhas: EntregaRecusada[] = [];

  // SEQUENCIAL, e não `Promise.all`. Três motivos concretos:
  //
  //   1. cada `checkoutAsset` abre uma transação; 50 em paralelo esgotam o pool
  //      do Prisma e passam a falhar por timeout de conexão — uma falha que
  //      nada tem a ver com a entrega e que apareceria no relatório como se
  //      tivesse;
  //   2. entregar o MESMO ativo duas vezes em paralelo (mesmo depois do
  //      `Set`, por duas requisições simultâneas) depende do índice único
  //      parcial para decidir, e aqui não há vantagem nenhuma em correr;
  //   3. o relatório sai na ordem pedida, que é a ordem em que a tela mostra as
  //      linhas — ler "falhou o 3º" tem que casar com a terceira linha da lista.
  for (const assetId of ids) {
    try {
      const resultado = await checkoutAsset(assetId, entrega, actorId);
      ok.push({
        assetId,
        assetTag: resultado.asset.assetTag,
        assignmentId: resultado.assignment.id,
      });
    } catch (erro) {
      falhas.push({ assetId, erro: motivoDaRecusa(assetId, erro) });
    }
  }

  // O log resume a operação inteira: é a única linha que liga as N transações
  // independentes ao clique que as pediu.
  logger.info('[BulkCheckout] Entrega em massa concluída.', {
    total: ids.length,
    entregues: ok.length,
    recusados: falhas.length,
    targetType: entrega.targetType,
  });

  return { total: ids.length, ok, falhas };
}

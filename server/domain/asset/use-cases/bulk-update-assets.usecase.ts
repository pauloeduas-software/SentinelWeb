import { randomUUID } from 'crypto';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity, type ActivityAction } from '../../activity/use-cases/record-activity.usecase';
import { assertStatusCoerenteComPosse, type ClienteStatusPosse } from './assert-status-posse.usecase';

// AÇÃO EM MASSA — uma operação, N ativos, TUDO OU NADA (D21).
//
// Não é "aplicar o que der e devolver relatório por linha": edição em massa é
// UMA intenção aplicada a N linhas, e metade aplicada é um estado que ninguém
// pediu e ninguém desfaz sem conferir os 200 um a um. Se uma invariante barrar
// um id, a transação inteira volta atrás e a resposta diz QUAL ativo barrou e
// por quê.
//
// É o oposto do checkout em massa da F4, que são N entregas independentes: ali
// "7 entregues, 1 recusado" é um resultado legível. A diferença não é
// inconsistência, é a natureza da operação.

/**
 * A allowlist de operação, no TIPO.
 *
 * União discriminada, e não `{ op: string; statusId?: string }`: com o campo
 * opcional, `op: 'status'` sem `statusId` compila, e a checagem viraria um `if`
 * em runtime que alguém esquece. Aqui o compilador só deixa passar a
 * combinação que existe, e o `z.discriminatedUnion` do schema devolve 422 com a
 * mesma regra na borda.
 */
export type BulkAssetsData =
  | { op: 'status'; ids: string[]; statusId: string }
  | { op: 'location'; ids: string[]; locationId: string | null }
  | { op: 'delete'; ids: string[] };

export interface BulkResult {
  op: BulkAssetsData['op'];
  /**
   * O mesmo id nas N linhas de `ActivityLog` do lote. É o que permite à tela
   * agrupar "20 ativos movidos para o Depósito" em vez de mostrar 20 eventos
   * soltos — e o que permite achar o lote inteiro depois de um engano.
   */
  batchId: string;
  afetados: number;
  ids: string[];
}

/**
 * `$transaction` do Prisma tem timeout de 5s por padrão e o lote de 200 são
 * ~201 statements: estourar no meio devolveria `P2028` — o rollback estaria
 * certo, mas o operador veria "erro desconhecido". Com o teto de ids validado
 * na borda, este teto de tempo é folga, não limite.
 */
const TRANSACAO = { timeout: 20_000, maxWait: 5_000 };

const ACAO: Record<BulkAssetsData['op'], ActivityAction> = {
  status: 'UPDATE',
  location: 'UPDATE',
  delete: 'DELETE',
};

/** O estado anterior de cada ativo do lote — o que o diff de cada linha precisa. */
interface AtivoDoLote {
  id: string;
  assetTag: string;
  statusId: string;
  locationId: string | null;
}

/**
 * Todos os ids existem e estão fora da lixeira?
 *
 * Conferir antes de escrever é o que transforma "um dos 200 sumiu" em uma
 * mensagem com a lista, em vez de um `P2025` no meio do laço. A tela pode estar
 * mostrando uma seleção montada antes de outra pessoa apagar um deles.
 */
async function carregarLote(client: ClienteStatusPosse, ids: string[]): Promise<AtivoDoLote[]> {
  const ativos = await client.asset.findMany({
    where: { id: { in: ids } },
    select: { id: true, assetTag: true, statusId: true, locationId: true },
  });

  if (ativos.length !== ids.length) {
    const achados = new Set(ativos.map((ativo) => ativo.id));
    const sumidos = ids.filter((id) => !achados.has(id));
    throw new AppError(
      `${sumidos.length} de ${ids.length} ativos não foram encontrados (ou estão na lixeira). Recarregue a lista.`,
      404,
      { ids: sumidos },
    );
  }

  return ativos;
}

/**
 * A guarda de posse do ativo, reaproveitada — nunca recopiada — com a etiqueta
 * na frente da mensagem.
 *
 * Sem a etiqueta, o operador leria "este ativo está entregue" olhando para 200
 * linhas selecionadas e não saberia por qual começar. O texto da regra continua
 * morando num lugar só: aqui só se diz DE QUEM ele é.
 *
 * DENTRO da transação de escrita, e não numa pré-validação: entre validar os
 * 200 e gravar existe uma janela em que alguém faz checkout de um deles.
 */
async function assertStatusDoLote(
  client: ClienteStatusPosse,
  ativos: AtivoDoLote[],
  statusId: string,
): Promise<void> {
  for (const ativo of ativos) {
    try {
      await assertStatusCoerenteComPosse(client, ativo.id, statusId);
    } catch (erro) {
      if (erro instanceof AppError) {
        throw new AppError(`${ativo.assetTag}: ${erro.message}`, erro.status, {
          ...erro.details,
          assetId: ativo.id,
          assetTag: ativo.assetTag,
        });
      }
      throw erro;
    }
  }
}

/** O que muda em `assets`, por operação. `delete` é o soft delete de sempre. */
function dadosDaOperacao(data: BulkAssetsData) {
  if (data.op === 'status') return { statusId: data.statusId };
  if (data.op === 'location') return { locationId: data.locationId };
  return { deletedAt: new Date() };
}

/**
 * O `changes` de UMA linha do lote — o diff do que aquele ativo perdeu e ganhou,
 * mais a identificação do lote a que ele pertence.
 *
 * `batchSize` acompanha o `batchId` porque sozinho ele não fecha conta: com os
 * dois, "20 ativos movidos" é verificável (`prisma/verificacoes/`) e a tela
 * pode dizer "1 de 20 deste lote" em vez de mostrar o evento solto. Sem ele, um
 * lote gravado com UMA linha em vez de N é indistinguível de um lote de um
 * ativo só.
 */
function mudancasDoAtivo(data: BulkAssetsData, ativo: AtivoDoLote, batchId: string, batchSize: number) {
  const comum = { batchId, batchSize, op: data.op };

  if (data.op === 'status') {
    return { ...comum, statusId: { de: ativo.statusId, para: data.statusId } };
  }
  if (data.op === 'location') {
    return { ...comum, locationId: { de: ativo.locationId, para: data.locationId } };
  }
  return comum;
}

export async function bulkUpdateAssets(data: BulkAssetsData, actorId: string | null = null): Promise<BulkResult> {
  // Ids repetidos na seleção não são erro do operador — são o mesmo ativo
  // clicado duas vezes. Deduplicar antes evita duas linhas de histórico para um
  // ativo só e faz a contagem de "não encontrados" bater.
  const ids = [...new Set(data.ids)];
  const batchId = randomUUID();

  return prisma.$transaction(async (tx) => {
    const ativos = await carregarLote(tx, ids);

    if (data.op === 'status') {
      // Existência do status por conta própria: deixar a FK falhar responderia
      // o 409 genérico de "registro em uso" do error-handler, que não é nem o
      // código nem a frase certa para "esse status não existe".
      const status = await tx.statusLabel.findUnique({ where: { id: data.statusId }, select: { id: true } });
      if (!status) throw new AppError('Status não encontrado.', 404);

      await assertStatusDoLote(tx, ativos, data.statusId);
    }

    if (data.op === 'location' && data.locationId) {
      const local = await tx.location.findUnique({ where: { id: data.locationId }, select: { id: true } });
      if (!local) throw new AppError('Localização não encontrada.', 404);
    }

    // NÃO há guarda de posse no `delete` do lote, e a ausência é deliberada: o
    // delete de um ativo só (`delete-asset.usecase.ts`) também não tem. Inventar
    // a regra só aqui faria a mesma operação ter dois comportamentos conforme o
    // botão clicado — que é exatamente o tipo de divergência que este código
    // evita em todo o resto.

    // UM `updateMany` para as N linhas: o diff de cada uma já está em memória
    // desde o `carregarLote`, então reler ativo por ativo custaria 200 viagens
    // ao banco para não descobrir nada novo.
    const { count } = await tx.asset.updateMany({
      where: { id: { in: ids } },
      data: dadosDaOperacao(data),
    });

    // UMA LINHA DE HISTÓRICO POR ATIVO, nunca uma pelo lote: a aba Histórico é
    // de um ativo, e um evento gravado no lote não apareceria em nenhuma delas.
    // As N levam o mesmo `batchId` para a tela poder reagrupá-las.
    for (const ativo of ativos) {
      await recordActivity(tx, {
        entityType: 'Asset',
        entityId: ativo.id,
        action: ACAO[data.op],
        changes: mudancasDoAtivo(data, ativo, batchId, ativos.length),
      }, actorId);
    }

    return { op: data.op, batchId, afetados: count, ids };
  }, TRANSACAO);
}

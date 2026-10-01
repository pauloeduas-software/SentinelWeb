import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { createLogger } from '../../../core/logger/logger';
import { ADAPTADORES } from '../helpers/adaptadores.helper';
import { mapearLinha, type MapeamentoValidado } from '../helpers/import-fields.helper';

const logger = createLogger('import.apply');

// O SEGUNDO PASSO (D68) — e ele só faz o que a simulação prometeu.
//
// ═════════════════════════════════════════════════════════════════════════════
// SÓ AS LINHAS QUE O DRY-RUN MARCOU COMO `OK` SÃO APLICADAS.
//
// A linha que estava `ERRO` fica `ERRO`, mesmo que o mundo tenha mudado e ela
// passasse agora. A direção importa: aplicar MAIS do que a tela mostrou é a
// surpresa perigosa — "vi 3 erros, cliquei em aplicar, e 3 cadastros a mais
// apareceram". O contrário (uma linha `OK` que virou `ERRO` entre os dois
// passos) é recusado com o motivo novo, que é a direção segura.
//
// MAS O PLANO É REFEITO, linha por linha, no momento de aplicar.
//
// O dry-run é uma FOTO. Entre ele e o apply alguém pode ter entregado o
// equipamento a outra pessoa, apagado a localização ou cadastrado o ativo que a
// planilha ia criar. Executar o plano velho escreveria a decisão de um mundo que
// não existe mais — e é assim que um import duplica ativo.
//
// UMA TRANSAÇÃO POR LINHA, E NÃO POR LOTE.
//
// O plano da fase previa "lotes com transação por lote", porque o `$transaction`
// do Prisma tem timeout de 5 s e 5.000 linhas não cabem numa só. A execução
// trocou isso por transação POR LINHA, e a troca é consequência do D17: a
// gravação passa pelos use-cases do domínio (`createAsset`, `checkoutAsset`,
// `createUser`), e cada um deles ABRE A PRÓPRIA transação — é lá que vivem o
// contador de etiqueta, a invariante de estado × posse e o `ActivityLog`.
//
// O resultado é melhor que o planejado: o timeout deixa de ser alcançável, cada
// linha é atômica por si, e `appliedUpTo` passa a ser exato em vez de "até o fim
// do lote 7". É o mesmo desenho da entrega em massa (D31): N operações
// independentes, com relatório — e não uma operação só que falha inteira.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * De quantas em quantas linhas o progresso é gravado.
 *
 * Não é transação: é só a frequência do `UPDATE` em `appliedUpTo`. Um por linha
 * seria uma escrita a mais por registro importado; um no fim deixaria o processo
 * morto no meio sem dizer até onde chegou.
 */
const PASSO_DO_PROGRESSO = 25;

export async function applyImport(id: string, actorId: string | null) {
  const importacao = await prisma.import.findUnique({
    where: { id },
    select: { id: true, target: true, status: true, mapping: true, appliedUpTo: true, filename: true },
  });

  if (!importacao) throw new AppError('Importação não encontrada.', 404);

  if (importacao.status === 'APLICADO') {
    throw new AppError(
      'Esta importação já foi aplicada. Suba o arquivo de novo para importar outra vez — '
        + 'reaplicar o mesmo relatório duplicaria o que já entrou.',
      409,
    );
  }
  if (importacao.status === 'RECUSADO') {
    throw new AppError('Esta importação foi recusada e não tem nada a aplicar.', 409);
  }
  if (importacao.status === 'APLICANDO') {
    throw new AppError(
      `Esta importação está sendo aplicada (chegou na linha ${importacao.appliedUpTo}). `
        + 'Aguarde o fim antes de tentar de novo.',
      409,
    );
  }

  const mapeamento = importacao.mapping as unknown as MapeamentoValidado;
  const adaptador = ADAPTADORES[importacao.target]();

  // `APLICANDO` antes da primeira gravação: é esta linha que impede dois
  // cliques simultâneos em "aplicar" rodarem o arquivo duas vezes.
  await prisma.import.update({ where: { id }, data: { status: 'APLICANDO' } });

  const pendentes = await prisma.importRow.findMany({
    where: { importId: id, status: 'OK', lineNumber: { gt: importacao.appliedUpTo } },
    select: { id: true, lineNumber: true, raw: true },
    orderBy: { lineNumber: 'asc' },
  });

  let aplicadas = 0;
  let recusadas = 0;

  for (const [indice, linha] of pendentes.entries()) {
    const raw = linha.raw as Record<string, string>;
    const mapeada = mapearLinha(raw, mapeamento);

    try {
      const plano = await adaptador.planejar(mapeada, mapeamento.chave);

      if (plano.situacao === 'OK') {
        const entityId = await plano.aplicar(actorId);
        await prisma.importRow.update({
          where: { id: linha.id },
          data: { status: 'OK', entityId, message: plano.descricao },
        });
        aplicadas++;
      } else {
        // Virou `IGNORADA` ou `ERRO` entre a simulação e agora. A linha recebe o
        // motivo NOVO: o antigo descreveria um mundo que já mudou.
        await prisma.importRow.update({
          where: { id: linha.id },
          data: {
            status: plano.situacao,
            message: plano.descricao,
            entityId: plano.situacao === 'IGNORADA' ? plano.entityId ?? null : null,
          },
        });
        recusadas++;
      }
    } catch (erro) {
      const mensagem = erro instanceof AppError ? erro.message : 'Falha inesperada ao aplicar esta linha.';
      if (!(erro instanceof AppError)) {
        logger.error('[Import] Falha inesperada ao aplicar uma linha.', erro, {
          importId: id, lineNumber: linha.lineNumber,
        });
      }

      await prisma.importRow.update({
        where: { id: linha.id },
        data: { status: 'ERRO', message: mensagem },
      });
      recusadas++;
    }

    // O PROGRESSO É GRAVADO NO BANCO, e não guardado em memória: é ele que
    // responde "o que entrou?" quando o processo morre no meio de uma carga de
    // cinco mil linhas.
    if ((indice + 1) % PASSO_DO_PROGRESSO === 0 || indice === pendentes.length - 1) {
      await prisma.import.update({ where: { id }, data: { appliedUpTo: linha.lineNumber } });
    }
  }

  // Os totais saem das LINHAS, não de um contador que foi somando: depois de
  // uma retomada, o contador em memória teria começado do zero.
  const porStatus = await prisma.importRow.groupBy({
    by: ['status'],
    where: { importId: id },
    _count: { _all: true },
  });

  const total = (status: string) =>
    porStatus.find((grupo) => grupo.status === status)?._count._all ?? 0;

  const atualizada = await prisma.import.update({
    where: { id },
    data: {
      status: 'APLICADO',
      appliedAt: new Date(),
      ok: total('OK'),
      erro: total('ERRO'),
      ignorada: total('IGNORADA'),
    },
    select: {
      id: true, filename: true, target: true, status: true, totalLinhas: true,
      ok: true, erro: true, ignorada: true, appliedUpTo: true, appliedAt: true,
    },
  });

  logger.info(
    `[Import] ${importacao.filename} aplicado: ${aplicadas} gravada(s), ${recusadas} recusada(s).`,
    { importId: id },
  );

  return atualizada;
}

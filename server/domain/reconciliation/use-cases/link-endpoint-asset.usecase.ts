import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { errorCode } from '../../../core/errors/error-shape';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';

// O VÍNCULO — a afirmação de que esta máquina descoberta e aquele patrimônio são
// a mesma coisa (D45).
//
// A FK mora no `Endpoint` e é `@unique`: o 1:1 é regra do banco, não da
// aplicação. O que este arquivo acrescenta é a MENSAGEM (o P2002 cru viraria
// "Registro já existe", que não diz nada a quem está na tela) e o ActivityLog.

const JA_TEM_MAQUINA = 'Este ativo já está vinculado a outra máquina. Desfaça aquele vínculo antes, pela aba Máquina do ativo.';

export interface OrigemDoVinculo {
  automatico?: boolean;
  sinal?: string | null;
  valor?: string | null;
  sugestaoId?: string | null;
}

/**
 * Liga endpoint e ativo, e fecha as sugestões que o assunto tornou obsoletas.
 *
 * As sugestões `LINK` pendentes DESTE endpoint viram `SUPERSEDED` na mesma
 * transação — inclusive as que apontavam para OUTROS ativos. Não é limpeza
 * cosmética: uma máquina só é um ativo, então depois do vínculo as outras
 * propostas passaram a ser sobre um mundo que não existe mais. Deixá-las
 * pendentes ofereceria a quem abrisse a fila a chance de "aceitar" um segundo
 * vínculo que o `@unique` recusaria com um erro sem explicação.
 */
export async function vincularEndpointAoAtivo(
  endpointId: string,
  assetId: string,
  actorId: string | null,
  origem: OrigemDoVinculo = {},
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const endpoint = await tx.endpoint.findUnique({
        where: { id: endpointId },
        select: { id: true, hwid: true, hostname: true, assetId: true },
      });
      if (!endpoint) throw new AppError('Máquina não encontrada.', 404);
      if (endpoint.assetId && endpoint.assetId !== assetId) {
        throw new AppError('Esta máquina já está vinculada a outro ativo.', 409);
      }

      // `findFirst`, e não `findUnique`: é ele que recebe o escopo da lixeira da
      // extension. Com `findUnique`, um ativo excluído poderia ser vinculado a
      // uma máquina viva e sumiria da tela levando o vínculo junto.
      const ativo = await tx.asset.findFirst({
        where: { id: assetId },
        select: { id: true, assetTag: true, name: true },
      });
      if (!ativo) throw new AppError('Ativo não encontrado.', 404);

      const vinculado = await tx.endpoint.update({
        where: { id: endpointId },
        data: { assetId },
        select: { id: true, hwid: true, hostname: true, assetId: true },
      });

      await tx.reconciliationSuggestion.updateMany({
        where: { endpointId, state: 'PENDING' },
        data: { state: 'SUPERSEDED', resolvedAt: new Date() },
      });

      await recordActivity(tx, {
        entityType: 'Asset',
        entityId: assetId,
        action: 'LINK',
        changes: {
          hostname: { de: null, para: endpoint.hostname },
          hwid: { de: null, para: endpoint.hwid },
          origem: { de: null, para: origem.automatico ? 'automatico' : 'manual' },
          sinal: { de: null, para: origem.sinal ?? null },
        },
      }, actorId);

      return vinculado;
    });
  } catch (error) {
    if (errorCode(error) === 'P2002') throw new AppError(JA_TEM_MAQUINA, 409);
    throw error;
  }
}

/**
 * Desfaz o vínculo.
 *
 * Existe porque o vínculo errado é o pior resultado possível desta fase, e
 * corrigi-lo não pode depender de mexer no banco à mão. O `ActivityLog` grava o
 * que havia — a mesma linha que, quando o `onDelete: SetNull` desfizer um
 * vínculo sozinho ao apagar um ativo, vai ser a única testemunha do que existia.
 *
 * NÃO encerra sugestão nenhuma, e isso é o que o parque permite: sugestão de
 * vínculo só nasce para máquina SEM ativo (`match-endpoint.usecase.ts`), e o
 * `vincular` acima encerra as pendentes na mesma transação em que grava o
 * `assetId`. Máquina vinculada não tem pendente, então aqui não havia o que
 * encerrar — a rodada seguinte do job é que volta a propor, com a máquina já
 * sem vínculo.
 */
export async function desvincularEndpoint(endpointId: string, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const endpoint = await tx.endpoint.findUnique({
      where: { id: endpointId },
      select: { id: true, hwid: true, hostname: true, assetId: true },
    });
    if (!endpoint) throw new AppError('Máquina não encontrada.', 404);
    if (!endpoint.assetId) throw new AppError('Esta máquina não está vinculada a nenhum ativo.', 409);

    const desvinculado = await tx.endpoint.update({
      where: { id: endpointId },
      data: { assetId: null },
      select: { id: true, hwid: true, hostname: true, assetId: true },
    });

    await recordActivity(tx, {
      entityType: 'Asset',
      entityId: endpoint.assetId,
      action: 'UNLINK',
      changes: {
        hostname: { de: endpoint.hostname, para: null },
        hwid: { de: endpoint.hwid, para: null },
      },
    }, actorId);

    return desvinculado;
  });
}

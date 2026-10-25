import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import {
  comoReferencias, licencasDoAtivo, nomesDasLicencas,
} from '../../license/use-cases/count-license-checkouts.usecase';
import { travarAtivoOuFalhar } from './lock-asset.usecase';

/**
 * Manda para a lixeira. O ativo TEM soft delete, ao contrário do catálogo (D8):
 * aqui a linha carrega histórico de compra, garantia e posse, e apagar de
 * verdade é perda de dado, não de cadastro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O 409 QUE PROTEGE A LICENÇA
 *
 * Um ativo com licença entregue não vai para a lixeira. Sem a recusa, a
 * licença fica PRESA: a contagem olha `license_checkouts`, que não tem
 * `deletedAt` e não sabe que o ativo sumiu.
 *
 * POR QUE NÃO O BANCO: apagar aqui é `UPDATE assets SET "deletedAt"`, o
 * Postgres não vê `DELETE` nenhum e a FK não é consultada — o ponto cego do
 * soft delete.
 *
 * A TRAVA vem antes da contagem, e é o que a torna confiável: sem ela, uma
 * entrega simultânea cria a linha DEPOIS deste `count` (`lock-asset.usecase.ts`).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function deleteAsset(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await travarAtivoOuFalhar(tx, id);

    // O 409 pela licença: ela continuaria descontada do contrato, e a empresa
    // pagaria por uma licença presa a uma máquina que saiu do inventário.
    // Pelo NOME, e como `refs`: a tela põe um link para o detalhe de cada uma,
    // onde mora o Devolver.
    const licencas = await licencasDoAtivo(tx, id);
    if (licencas.length > 0) {
      throw new AppError(
        `Este ativo ainda tem ${licencas.length === 1 ? 'a licença' : 'as licenças'} ${nomesDasLicencas(licencas)}. `
        + 'Devolva pela tela de Licenças antes de excluir.',
        409,
        comoReferencias(licencas),
      );
    }

    const { count } = await tx.asset.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    // Zero linhas aqui só pode ser UMA coisa: o ativo já estava na lixeira. O id
    // inexistente foi separado pela trava lá em cima, que responde 404 antes de
    // chegar neste ponto.
    if (count === 0) throw new AppError('Este ativo já está na lixeira.', 409);

    await recordActivity(tx, { entityType: 'Asset', entityId: id, action: 'DELETE' });
  });
}

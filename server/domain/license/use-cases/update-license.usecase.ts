import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildChanges } from '../../shared/diff.helper';
import { LICENSE_AUDITED } from '../helpers/license-audited.helper';
import { contarAssentosDe, travarLicencaOuFalhar } from '../helpers/license-seats.helper';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import type { UpdateLicenseData } from '../schemas/license.schema';
import { assertReferenciasDaLicenca } from './assert-license-references.usecase';
import { cifrarChaveOuRecusar } from './create-license.usecase';
import { reconciliarAssentos } from './reconcile-seats.usecase';

/**
 * A EDIÇÃO — e ela pode mudar o tamanho do contrato.
 *
 * `seatsTotal` ENTRA aqui, ao contrário do `qty` do estoque, e a diferença é
 * real: `qty` é consequência de movimentação, enquanto `seatsTotal` é o NÚMERO
 * DO CONTRATO — alguém comprou mais assentos, e digitar isso É a operação. O
 * que não pode é ele mudar sem as linhas mudarem junto, e por isso a
 * reconciliação acontece na MESMA transação (invariante 11).
 *
 * A TRAVA DA LICENÇA vem primeiro (D90) e serializa duas edições simultâneas:
 * sem ela, as duas leem 5, uma grava 8 e a outra 6, e as duas inserem assentos
 * — o `seatNumber` colide no índice único e o P2002 vira "Registro já existe".
 */
export async function updateLicense(
  id: string,
  data: UpdateLicenseData,
  actorId: string | null,
): Promise<LicencaNaResposta> {
  const { productKey, ...campos } = data;

  // FORA da transação: é checagem de configuração do servidor, não do banco.
  // O `id` já existe aqui — é o da rota —, então o AAD é o certo.
  const cifrada = cifrarChaveOuRecusar(productKey, id);

  const licenca = await prisma.$transaction(async (tx) => {
    await travarLicencaOuFalhar(tx, id);

    const antes = await tx.license.findFirst({
      where: { id },
      select: LICENSE_SELECT,
    }) as LinhaDeLicenca | null;
    if (!antes) throw new AppError('Nenhuma licença com este identificador.', 404);

    await assertReferenciasDaLicenca(tx, campos);

    const depois = await tx.license.update({
      where: { id },
      data: { ...campos, productKey: cifrada, updatedById: actorId },
      select: LICENSE_SELECT,
    }) as LinhaDeLicenca;

    // O CONTRATO E AS LINHAS, JUNTOS. Só quando `seatsTotal` veio no corpo:
    // reconciliar numa edição que não o mencionou seria trabalho — e travas —
    // à toa em toda troca de observação.
    if (data.seatsTotal !== undefined) {
      await reconciliarAssentos(tx, id, data.seatsTotal);
    }

    // Só o que REALMENTE mudou vai para o log. `hasProductKey` entra à parte
    // porque `productKey` não é auditado (D42): o diff publicaria o segredo.
    const changes: Record<string, unknown> = buildChanges(antes, depois, LICENSE_AUDITED);
    if ((antes.productKey !== null) !== (depois.productKey !== null)) {
      changes.hasProductKey = { de: antes.productKey !== null, para: depois.productKey !== null };
    } else if (cifrada !== undefined && depois.productKey !== null && antes.productKey !== depois.productKey) {
      // Chave TROCADA por outra: o booleano não muda, e sem esta linha o
      // histórico não registraria nada. `true` sem "de/para" porque não existe
      // valor anterior que possa ser mostrado — e é esse o ponto.
      changes.productKeyTrocada = true;
    }

    if (Object.keys(changes).length > 0) {
      await recordActivity(tx, {
        entityType: 'License', entityId: id, action: 'UPDATE', changes: changes as never,
      }, actorId);
    }

    return depois;
  });

  return paraResposta(licenca, await contarAssentosDe(prisma, id), { comMascara: true });
}

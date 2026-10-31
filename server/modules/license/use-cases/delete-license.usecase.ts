import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildSnapshot } from '../../shared/diff.helper';
import { CAMPOS_AUDITADOS_DA_LICENCA, LICENSE_SELECT, rotuloDoAlvoDaEntrega } from '../helpers/license-select.helper';
import { travarLicencaOuFalhar } from './lock-license.usecase';

/**
 * EXCLUIR DE VEZ — a regra do POSTO (AG), a mesma do item de estoque: só o que
 * está em uso AGORA impede.
 *
 * A licença com entrega aberta recebe 409, que diz com quem e manda devolver. A
 * que já foi entregue e voltou se exclui: as entregas devolvidas perdem a
 * ligação e guardam o nome por escrito, e o histórico do computador e o do
 * colaborador continuam dizendo "Office 2021". As chaves vão junto com a
 * licença — a entrega devolvida perde também a dela: nenhuma tela fora do
 * detalhe da licença a mostrava, e chave é dado sensível, que não se copia.
 * O histórico da própria licença vai junto; o contrato que se quer guardar se
 * ENCERRA.
 *
 * Sem lixeira: a FK `Restrict` de `license_checkouts` é a rede — nenhuma entrega
 * em uso fica sem licença (CHECK `license_checkouts_licenca_presente`).
 */
export async function deleteLicense(id: string, ator: Ator): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // A trava antes da contagem: sem ela, uma entrega simultânea nasceria
    // depois deste `findMany`, e a FK recusaria o DELETE com uma frase genérica.
    await travarLicencaOuFalhar(tx, id);
    const licenca = await tx.license.findUniqueOrThrow({ where: { id }, select: LICENSE_SELECT });

    const emUso = await tx.licenseCheckout.findMany({
      where: { licenseId: id, checkinAt: null },
      select: { assignedPerson: { select: { name: true } }, assignedAsset: { select: { assetTag: true, name: true } } },
    });
    if (emUso.length > 0) {
      const alvos = emUso.map(rotuloDoAlvoDaEntrega).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const lista = alvos.length === 1 ? alvos[0] : `${alvos.slice(0, -1).join(', ')} e ${alvos[alvos.length - 1]}`;
      throw new AppError(
        `"${licenca.name}" ainda tem ${alvos.length === 1 ? '1 entrega em uso' : `${alvos.length} entregas em uso`} `
        + `(${lista}). Devolva antes de excluir.`,
        409,
      );
    }

    // O PASSADO SOLTA A LICENÇA, como no posto: as entregas devolvidas guardam
    // o nome e perdem a chave, e a FK deixa o DELETE passar — as chaves vão
    // junto, pela `Cascade` de `license_keys`.
    await tx.licenseCheckout.updateMany({
      where: { licenseId: id },
      data: { licenseId: null, licenseName: licenca.name, licenseKeyId: null },
    });
    await tx.license.delete({ where: { id } });

    // A exclusão é DE VERDADE: o retrato é o que sobra de que a licença existiu.
    await recordAudit(tx, {
      entityType: 'License',
      entityId: id,
      entityLabel: licenca.name,
      action: 'DELETE',
      changes: buildSnapshot(licenca, CAMPOS_AUDITADOS_DA_LICENCA),
    }, ator);
  });
}

import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildChanges } from '../../shared/diff.helper';
import { hojeNoBrasil } from '../../shared/hoje.helper';
import { assertDatasNaoAntecedemACompra, assertEncerraSemEntregaAberta } from '../helpers/license-dates.helper';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import { statusDaLicenca } from '../helpers/license-status.helper';
import { contarUsoDe } from './count-license-checkouts.usecase';
import { travarLicencaOuFalhar } from './lock-license.usecase';

/**
 * ENCERRAR — o contrato acabou: a licença fica na lista, esmaecida (AF), e não
 * recebe nada novo.
 *
 * Grava o dia de hoje em `terminationDate`; é a data que manda (o status
 * ENCERRADA é derivado dela, D44).
 *
 * SÓ COM TUDO DEVOLVIDO — 409 com a entrega aberta, o padrão do sistema para o
 * que depende de outra coisa em uso. A data do formulário segue a mesma regra,
 * e não aceita futuro: a licença nunca encerra por baixo de quem a usa.
 *
 * Reabrir é limpar a data na edição — não precisa de rota própria.
 */
export async function terminateLicense(id: string, ator: Ator): Promise<LicencaNaResposta> {
  const licenca = await prisma.$transaction(async (tx) => {
    // A trava serializa o Encerrar com a entrega: a entrega que chega depois
    // encontra a licença encerrada e é recusada.
    await travarLicencaOuFalhar(tx, id);
    const antes = await tx.license.findUniqueOrThrow({ where: { id }, select: LICENSE_SELECT }) as LinhaDeLicenca;

    if (statusDaLicenca(antes) === 'ENCERRADA') {
      throw new AppError(`"${antes.name}" já está encerrada.`, 409);
    }

    await assertEncerraSemEntregaAberta(tx, id, antes.name);

    // A compra não aceita futuro, mas a gravada antes dessa regra pode estar
    // depois de hoje: o 422 vem antes do CHECK.
    const hoje = hojeNoBrasil();
    assertDatasNaoAntecedemACompra({ ...antes, terminationDate: hoje });

    const depois = await tx.license.update({
      where: { id },
      data: { terminationDate: hoje },
      select: LICENSE_SELECT,
    }) as LinhaDeLicenca;

    await recordAudit(tx, {
      entityType: 'License',
      entityId: id,
      entityLabel: depois.name,
      action: 'END',
      changes: buildChanges(antes, depois, ['terminationDate']),
    }, ator);

    return depois;
  });

  return paraResposta(licenca, await contarUsoDe(prisma, id));
}

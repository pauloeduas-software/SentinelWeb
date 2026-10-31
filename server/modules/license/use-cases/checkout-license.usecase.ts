import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { travarPessoaOuFalhar } from '../../person/use-cases/lock-person.usecase';
import { travarAtivo } from '../../asset/use-cases/lock-asset.usecase';
import { diaEmPortugues } from '../../asset/helpers/asset-dates.helper';
import { hojeNoBrasil, instanteDoDia } from '../../shared/hoje.helper';
import { fraseSemVaga } from '../helpers/license-count.helper';
import { CHECKOUT_SELECT } from '../helpers/license-select.helper';
import { diasParaVencer, statusDaLicenca } from '../helpers/license-status.helper';
import type { CheckoutLicenseData } from '../schemas/license.schema';
import { contarUsoDe, type ClienteLicenca } from './count-license-checkouts.usecase';
import { chaveDaEntrega } from './license-keys.usecase';
import { travarLicencaOuFalhar } from './lock-license.usecase';

// A ENTREGA DE UMA LICENÇA.
//
// ═════════════════════════════════════════════════════════════════════════════
// O ALVO É PESSOA **XOR** ATIVO — NUNCA UM POSTO (D39).
//
// LICENÇA É CONSUMIDA POR UMA INSTALAÇÃO OU POR UM USUÁRIO NOMEADO. O fornecedor
// licencia por dispositivo (Windows, Office avulso) ou por pessoa (assinaturas
// como o Microsoft 365); não existe EULA que licencie um móvel. O desktop fixo
// da Mesa 1 é um `Asset`: a licença vai PARA O ATIVO, e quem responde pela mesa
// sai da posse daquele ativo.
// ═════════════════════════════════════════════════════════════════════════════

type AlvoDaEntrega = { tipo: 'PERSON' | 'ASSET'; id: string };

/**
 * Exatamente UMA das duas chaves preenchida.
 *
 * O BANCO TAMBÉM GARANTE (`license_checkouts_alvo_xor`), e esta função continua
 * existindo para dar 422 com o nome do campo que falta: o erro do CHECK viraria
 * uma mensagem sobre constraint. O banco GARANTE, a aplicação EXPLICA
 * (docs/referencia/invariantes.md).
 *
 * Devolve o alvo já escolhido: o resto do use-case grava a partir dele e nunca
 * mais lê as duas chaves do corpo.
 */
function assertAlvoCoerente(data: CheckoutLicenseData): AlvoDaEntrega {
  const { assignedPersonId, assignedAssetId } = data;

  if (assignedPersonId && assignedAssetId) {
    throw new AppError(
      'Uma entrega tem UM alvo: informe o colaborador OU o ativo, nunca os dois.',
      422,
    );
  }

  if (assignedPersonId) return { tipo: 'PERSON', id: assignedPersonId };
  if (assignedAssetId) return { tipo: 'ASSET', id: assignedAssetId };

  throw new AppError(
    'A entrega de uma licença exige um alvo: assignedPersonId (colaborador) ou assignedAssetId (ativo). '
    + 'Posto de trabalho não é alvo de licença — entregue ao ativo que está na mesa.',
    422,
  );
}

/**
 * O alvo existe e pode receber? Devolve o nome dele, para a frase do 409 do
 * mesmo alvo (`assertAlvoSemEntregaAberta`).
 *
 * Os dois saem por `findFirst`, que o escopo da lixeira alcança: alvo na
 * lixeira é 404. O ESTADO que recusa é 409: ativo baixado, colaborador
 * desativado.
 */
async function assertAlvoApto(
  client: ClienteLicenca,
  alvo: AlvoDaEntrega,
): Promise<{ nome: string; compra: Date | null }> {
  if (alvo.tipo === 'ASSET') {
    const ativo = await client.asset.findFirst({
      where: { id: alvo.id },
      select: { id: true, assetTag: true, name: true, retiredAt: true, purchaseDate: true },
    });
    if (!ativo) throw new AppError('Ativo não encontrado.', 404);

    // BAIXADO é diferente de APAGADO, e os dois são recusados: licença numa
    // máquina que saiu do inventário é licença paga para ninguém.
    if (ativo.retiredAt) {
      throw new AppError(`O ativo ${ativo.assetTag} teve baixa e não pode receber licença.`, 409);
    }
    return { nome: ativo.name ? `${ativo.assetTag} — ${ativo.name}` : ativo.assetTag, compra: ativo.purchaseDate };
  }

  const pessoa = await client.person.findFirst({
    where: { id: alvo.id },
    select: { id: true, name: true, isActive: true },
  });
  if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);

  // DESATIVADO é diferente de APAGADO. 409 e não 404: a pessoa existe, o estado
  // dela é que recusa — e entregar a quem saiu abriria uma pendência que a
  // desativação acabou de exigir zerada.
  if (!pessoa.isActive) {
    throw new AppError(`${pessoa.name} está desativado(a) e não pode receber licença.`, 409);
  }
  return { nome: pessoa.name, compra: null };
}

/** As entregas daquele alvo, no `where`. */
function doAlvo(alvo: AlvoDaEntrega) {
  return alvo.tipo === 'PERSON' ? { assignedPersonId: alvo.id } : { assignedAssetId: alvo.id };
}

/** O mesmo alvo não fica com duas entregas abertas da mesma licença (invariante 23). */
async function assertAlvoSemEntregaAberta(
  client: ClienteLicenca,
  licenseId: string,
  nomeDaLicenca: string,
  alvo: AlvoDaEntrega,
  nomeDoAlvo: string,
): Promise<void> {
  const aberta = await client.licenseCheckout.findFirst({
    where: { licenseId, checkinAt: null, ...doAlvo(alvo) },
    select: { id: true },
  });
  if (aberta) {
    throw new AppError(
      `${nomeDoAlvo} já está com "${nomeDaLicenca}". Uma licença vai uma vez para cada `
      + 'computador ou colaborador.',
      409,
    );
  }
}

/**
 * O DIA DA ENTREGA contra o passado da licença — e o instante a gravar.
 *
 * O dia não antecede a data da compra da licença, nem a do computador que a
 * recebe — a licença instalada numa máquina que ainda não tinha sido comprada —,
 * nem o dia em que o mesmo alvo devolveu
 * esta licença: a entrega que volta no tempo para antes da devolução poria o
 * alvo com a licença duas vezes no mesmo período (invariante 23, no histórico).
 * Os dois dias no calendário de Brasília, como na devolução.
 *
 * A QUANTIDADE no passado não é conferida — quantas estavam em uso naquele dia.
 *
 * No mesmo dia da devolução, o meio-dia do dia passado pode cair antes da hora
 * real dela; a entrega fica um milissegundo depois, e não no mesmo instante:
 * no empate, os históricos poriam a devolução antiga acima da entrega nova.
 */
async function instanteDaEntrega(
  client: ClienteLicenca,
  licenca: { id: string; name: string; purchaseDate: Date | null },
  alvo: AlvoDaEntrega,
  { nome: nomeDoAlvo, compra: compraDoAlvo }: { nome: string; compra: Date | null },
  checkoutAt: Date | undefined,
): Promise<Date | undefined> {
  const dia = checkoutAt ?? hojeNoBrasil();
  if (licenca.purchaseDate && dia < licenca.purchaseDate) {
    throw new AppError(
      `A entrega (${diaEmPortugues(dia)}) não pode ser antes da data da compra (${diaEmPortugues(licenca.purchaseDate)}).`,
      422,
    );
  }
  if (compraDoAlvo && dia < compraDoAlvo) {
    throw new AppError(
      `A entrega (${diaEmPortugues(dia)}) não pode ser antes da compra de ${nomeDoAlvo} (${diaEmPortugues(compraDoAlvo)}).`,
      422,
    );
  }

  const anterior = await client.licenseCheckout.findFirst({
    where: { licenseId: licenca.id, checkinAt: { not: null }, ...doAlvo(alvo) },
    orderBy: { checkinAt: 'desc' },
    select: { checkinAt: true },
  });
  const devolvidaEm = anterior?.checkinAt;
  if (devolvidaEm && dia < hojeNoBrasil(devolvidaEm)) {
    throw new AppError(
      `A entrega (${diaEmPortugues(dia)}) não pode ser antes de ${diaEmPortugues(hojeNoBrasil(devolvidaEm))}: `
      + `até esse dia ${nomeDoAlvo} estava com "${licenca.name}".`,
      422,
    );
  }

  // Ausente, quem preenche é o `@default(now())` — depois de qualquer devolução.
  if (!checkoutAt) return undefined;
  const instante = instanteDoDia(checkoutAt);
  return devolvidaEm && instante <= devolvidaEm ? new Date(devolvidaEm.getTime() + 1) : instante;
}

/** Vencida e encerrada não recebem entrega nova. VENCENDO entrega normalmente. */
function assertLicencaVigente(
  licenca: { name: string; expirationDate: Date | null; terminationDate: Date | null },
): void {
  // Entregar licença vencida ou encerrada é registrar, no próprio inventário,
  // software em uso sem direito de uso — o achado mais caro de uma auditoria de
  // fornecedor, e o mesmo que o alerta aponta.
  const status = statusDaLicenca(licenca);
  if (status === 'ENCERRADA') {
    throw new AppError(
      `A licença "${licenca.name}" está encerrada e não recebe entrega. `
      + 'Se o contrato voltou, reabra-a antes.',
      409,
    );
  }
  if (status === 'EXPIRADA') {
    const dias = Math.abs(diasParaVencer(licenca.expirationDate) ?? 0);
    throw new AppError(
      `A licença "${licenca.name}" venceu há ${dias} ${dias === 1 ? 'dia' : 'dias'} e não recebe `
      + 'entrega: renove o contrato e atualize a data de vencimento antes.',
      409,
    );
  }
}

export async function checkoutLicense(licenseId: string, data: CheckoutLicenseData, ator: Ator) {
  // Fora da transação: é validação de FORMATO do corpo, não lê o banco.
  const alvo = assertAlvoCoerente(data);

  return prisma.$transaction(async (tx) => {
    // ORDEM DE TRAVAMENTO: **alvo, depois licença** (`lock-license.usecase.ts`).
    // A trava do alvo protege a contagem que a desativação do colaborador e a
    // baixa do ativo leem; a da licença, a conta de livres.
    // O ativo inexistente diz "Ativo", como o colaborador diz "Colaborador" — e
    // não o "Registro não encontrado" das telas de ativo.
    if (alvo.tipo === 'PERSON') await travarPessoaOuFalhar(tx, alvo.id);
    else if (!(await travarAtivo(tx, alvo.id))) throw new AppError('Ativo não encontrado.', 404);

    await travarLicencaOuFalhar(tx, licenseId);
    const licenca = await tx.license.findUniqueOrThrow({
      where: { id: licenseId },
      select: {
        id: true, name: true, seatsTotal: true,
        expirationDate: true, terminationDate: true, purchaseDate: true,
      },
    });

    // O alvo antes da licença: o colaborador na lixeira é 404 mesmo com a
    // licença vencida.
    const apto = await assertAlvoApto(tx, alvo);
    const nomeDoAlvo = apto.nome;
    assertLicencaVigente(licenca);
    await assertAlvoSemEntregaAberta(tx, licenseId, licenca.name, alvo, nomeDoAlvo);
    const checkoutAt = await instanteDaEntrega(tx, licenca, alvo, apto, data.checkoutAt ?? undefined);

    // A CONTA, com a licença travada: nenhuma outra entrega desta licença está
    // em voo, e o número que sai daqui é o que o INSERT vai encontrar.
    const uso = await contarUsoDe(tx, licenseId);
    if (uso.emUso >= licenca.seatsTotal) {
      throw new AppError(fraseSemVaga(licenca.name, licenca.seatsTotal, uso), 409);
    }

    // A CHAVE depois da conta: sem licença livre, a frase certa é essa, e não a
    // de que as chaves acabaram (AC).
    const licenseKeyId = await chaveDaEntrega(tx, licenca, data.licenseKeyId);

    const entrega = await tx.licenseCheckout.create({
      data: {
        licenseId,
        // As duas escritas a partir do alvo JÁ ESCOLHIDO, nunca do corpo.
        assignedPersonId: alvo.tipo === 'PERSON' ? alvo.id : null,
        assignedAssetId: alvo.tipo === 'ASSET' ? alvo.id : null,
        checkoutNotes: data.notes ?? null,
        licenseKeyId,
        checkoutAt,
      },
      select: CHECKOUT_SELECT,
    });

    await recordAudit(tx, {
      entityType: 'License',
      entityId: licenseId,
      entityLabel: licenca.name,
      action: 'CHECKOUT',
      changes: {
        checkoutId: entrega.id,
        targetType: alvo.tipo,
        targetId: alvo.id,
        targetName: nomeDoAlvo,
        checkoutAt: entrega.checkoutAt.toISOString(),
        // Qual chave, pelo id: o texto nunca entra na auditoria.
        ...(licenseKeyId ? { licenseKeyId } : {}),
      },
    }, ator);

    return entrega;
  });
}

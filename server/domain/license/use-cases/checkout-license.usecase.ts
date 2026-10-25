import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { travarPessoaOuFalhar } from '../../person/use-cases/lock-person.usecase';
import { travarAtivoOuFalhar } from '../../asset/use-cases/lock-asset.usecase';
import { instanteDoDia } from '../../shared/hoje.helper';
import { fraseSemVaga } from '../helpers/license-count.helper';
import { CHECKOUT_SELECT } from '../helpers/license-select.helper';
import { diasParaVencer, statusDaLicenca } from '../helpers/license-status.helper';
import type { CheckoutLicenseData } from '../schemas/license.schema';
import { contarUsoDe, type ClienteLicenca } from './count-license-checkouts.usecase';
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
async function assertAlvoApto(client: ClienteLicenca, alvo: AlvoDaEntrega): Promise<string> {
  if (alvo.tipo === 'ASSET') {
    const ativo = await client.asset.findFirst({
      where: { id: alvo.id },
      select: { id: true, assetTag: true, name: true, retiredAt: true },
    });
    if (!ativo) throw new AppError('Ativo não encontrado.', 404);

    // BAIXADO é diferente de APAGADO, e os dois são recusados: licença numa
    // máquina que saiu do inventário é licença paga para ninguém.
    if (ativo.retiredAt) {
      throw new AppError(`O ativo ${ativo.assetTag} teve baixa e não pode receber licença.`, 409);
    }
    return ativo.name ? `${ativo.assetTag} — ${ativo.name}` : ativo.assetTag;
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
  return pessoa.name;
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
    where: {
      licenseId,
      checkinAt: null,
      ...(alvo.tipo === 'PERSON' ? { assignedPersonId: alvo.id } : { assignedAssetId: alvo.id }),
    },
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
 * A mesma chave não fica em duas entregas ABERTAS da licença. A conferência é a
 * frase; o índice único parcial `license_checkouts_chave_aberta_unica` é a rede.
 * Quem chama segura a trava da licença: duas entregas com a mesma chave não
 * passam juntas por aqui.
 */
export async function assertChaveLivre(
  client: ClienteLicenca,
  licenseId: string,
  nomeDaLicenca: string,
  productKey: string | null | undefined,
  excetoEntregaId?: string,
): Promise<void> {
  if (!productKey) return;
  const outra = await client.licenseCheckout.findFirst({
    where: {
      licenseId,
      productKey,
      checkinAt: null,
      ...(excetoEntregaId ? { id: { not: excetoEntregaId } } : {}),
    },
    select: { id: true },
  });
  if (outra) {
    throw new AppError(`Esta chave já está em outra entrega aberta de "${nomeDaLicenca}".`, 409);
  }
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
      `A licença "${licenca.name}" está ENCERRADA e não recebe entrega. `
      + 'Se o contrato voltou, limpe a data de encerramento antes.',
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

export async function checkoutLicense(licenseId: string, data: CheckoutLicenseData) {
  // Fora da transação: é validação de FORMATO do corpo, não lê o banco.
  const alvo = assertAlvoCoerente(data);

  return prisma.$transaction(async (tx) => {
    // ORDEM DE TRAVAMENTO: **alvo, depois licença** (`lock-license.usecase.ts`).
    // A trava do alvo protege a contagem que a desativação do colaborador e a
    // baixa do ativo leem; a da licença, a conta de livres.
    if (alvo.tipo === 'PERSON') await travarPessoaOuFalhar(tx, alvo.id);
    else await travarAtivoOuFalhar(tx, alvo.id);

    await travarLicencaOuFalhar(tx, licenseId);
    const licenca = await tx.license.findUniqueOrThrow({
      where: { id: licenseId },
      select: {
        id: true, name: true, seatsTotal: true,
        expirationDate: true, terminationDate: true,
      },
    });

    assertLicencaVigente(licenca);

    const nomeDoAlvo = await assertAlvoApto(tx, alvo);
    await assertAlvoSemEntregaAberta(tx, licenseId, licenca.name, alvo, nomeDoAlvo);
    await assertChaveLivre(tx, licenseId, licenca.name, data.productKey);

    // A CONTA, com a licença travada: nenhuma outra entrega desta licença está
    // em voo, e o número que sai daqui é o que o INSERT vai encontrar.
    const uso = await contarUsoDe(tx, licenseId);
    if (uso.emUso >= licenca.seatsTotal) {
      throw new AppError(fraseSemVaga(licenca.name, licenca.seatsTotal, uso), 409);
    }

    return tx.licenseCheckout.create({
      data: {
        licenseId,
        // As duas escritas a partir do alvo JÁ ESCOLHIDO, nunca do corpo.
        assignedPersonId: alvo.tipo === 'PERSON' ? alvo.id : null,
        assignedAssetId: alvo.tipo === 'ASSET' ? alvo.id : null,
        checkoutNotes: data.notes ?? null,
        productKey: data.productKey ?? null,
        // Ausente, quem preenche é o `@default(now())`.
        checkoutAt: data.checkoutAt ? instanteDoDia(data.checkoutAt) : undefined,
      },
      select: CHECKOUT_SELECT,
    });
  });
}

import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { travarUsuarioOuFalhar } from '../../user/use-cases/lock-user.usecase';
import { travarAtivoOuFalhar } from '../../asset/use-cases/lock-asset.usecase';
import {
  contarAssentosDe, pegarAssentoLivre, type ClienteLicenca,
} from '../helpers/license-seats.helper';
import { SEAT_CHECKOUT_SELECT } from '../helpers/license-select.helper';
import { diasParaVencer, statusDaLicenca } from '../helpers/license-status.helper';
import type { CheckoutSeatData } from '../schemas/license.schema';

// A ENTREGA DE UM ASSENTO DE LICENÇA.
//
// ═════════════════════════════════════════════════════════════════════════════
// O ALVO É PESSOA **XOR** ATIVO — NUNCA UM POSTO (D39).
//
// A ausência de `assignedLocationId` é a decisão, e ela tem três argumentos:
//
// 1. LICENÇA É CONSUMIDA POR UMA INSTALAÇÃO. O fornecedor licencia por
//    dispositivo ou por usuário nomeado; não existe EULA que licencie um móvel.
//    Quando o auditor pergunta onde o assento está, "na Mesa 1" não conta.
//
// 2. A F7 QUEBRARIA. A conformidade alimentada pelo software instalado é o join
//    `LicenseSeat → Asset → Endpoint → SoftwareInstallation`. Um assento
//    apontando para uma `Location` não tem caminho até uma instalação: seria um
//    buraco exatamente no relatório que justifica o módulo.
//
// 3. O CASO DO POSTO COMPARTILHADO JÁ TEM RESPOSTA, E ELA É MAIS HONESTA. O
//    desktop fixo da Mesa 1 é um `Asset`: o assento vai PARA O ATIVO, a
//    `Assignment` daquele ativo aponta para a `Location`, e os responsáveis
//    saem da Camada 2. E se a licença for por usuário nomeado, Laura e Ana
//    precisam de DOIS assentos — um pendurado na mesa esconderia duas pessoas
//    atrás de um móvel, que é precisamente a exposição de conformidade que o
//    módulo deveria estar apontando.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Exatamente UMA das duas chaves preenchida.
 *
 * O BANCO TAMBÉM GARANTE (`license_seat_alvo_xor`), e esta função continua
 * existindo para dar 422 com o nome do campo que falta: o erro do CHECK viraria
 * uma mensagem sobre constraint, que não ensina nada a quem preencheu o
 * formulário. É a regra do INVARIANTES.md — o banco GARANTE, a aplicação
 * EXPLICA.
 *
 * Devolve o alvo já escolhido: o resto do use-case grava a partir dele e nunca
 * mais lê as duas chaves do corpo. É o que garante que a outra fique nula, em
 * vez de depender de o cliente ter mandado só uma.
 */
function assertAlvoCoerente(data: CheckoutSeatData): { tipo: 'USER' | 'ASSET'; id: string } {
  const { assignedUserId, assignedAssetId } = data;

  if (assignedUserId && assignedAssetId) {
    throw new AppError(
      'Um assento tem UM alvo: informe o colaborador OU o ativo, nunca os dois. '
      + 'Se a licença é por usuário nomeado e duas pessoas usam a mesma máquina, são dois assentos.',
      422,
    );
  }

  if (assignedUserId) return { tipo: 'USER', id: assignedUserId };
  if (assignedAssetId) return { tipo: 'ASSET', id: assignedAssetId };

  throw new AppError(
    'A entrega de um assento exige um alvo: assignedUserId (colaborador) ou assignedAssetId (ativo). '
    + 'Posto de trabalho não é alvo de licença — entregue ao ativo que está na mesa.',
    422,
  );
}

/**
 * O alvo existe e pode receber?
 *
 * Os dois saem por `findFirst`, que o escopo da lixeira alcança: não se entrega
 * assento nem a um cadastro apagado nem a um ativo apagado.
 */
async function assertAlvoApto(
  client: ClienteLicenca,
  alvo: { tipo: 'USER' | 'ASSET'; id: string },
): Promise<string> {
  if (alvo.tipo === 'ASSET') {
    const ativo = await client.asset.findFirst({
      where: { id: alvo.id },
      select: { id: true, assetTag: true, retiredAt: true },
    });
    if (!ativo) throw new AppError('Ativo não encontrado.', 404);

    // DESCOMISSIONADO é diferente de APAGADO, e os dois precisam ser recusados.
    // Entregar assento a um ativo que saiu do inventário paga licença para uma
    // máquina que não existe mais — e é justamente o tipo de assento que some
    // da conta sem ninguém notar.
    if (ativo.retiredAt) {
      throw new AppError(
        `O ativo ${ativo.assetTag} está descomissionado e não pode receber assento de licença.`,
        409,
      );
    }
    return ativo.assetTag;
  }

  const pessoa = await client.user.findFirst({
    where: { id: alvo.id },
    select: { id: true, name: true, isActive: true },
  });
  if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);

  // DESLIGADO é diferente de APAGADO (D32). 409 e não 404: a pessoa existe, o
  // estado dela é que recusa. Entregar a quem saiu reabriria, uma linha depois
  // do desligamento, exatamente a pendência que o desligamento fechou.
  if (!pessoa.isActive) {
    throw new AppError(`${pessoa.name} está desligado(a) e não pode receber assento de licença.`, 409);
  }
  return pessoa.name;
}

export async function checkoutSeat(
  licenseId: string,
  data: CheckoutSeatData,
  actorId: string | null,
) {
  // Fora da transação: é validação de FORMATO do corpo, não lê o banco, e abrir
  // transação para recusar um payload incoerente é segurar conexão à toa.
  const alvo = assertAlvoCoerente(data);

  return prisma.$transaction(async (tx) => {
    // ORDEM DE TRAVAMENTO: **alvo antes do assento**, a mesma regra que a F4
    // fixou para usuário antes de ativo e a F5 para usuário antes do item. Duas
    // transações que travam os mesmos dois recursos em ordens opostas travam
    // uma à outra, e o Postgres mata uma delas.
    //
    // No alvo `USER` o motivo é o mesmo da F5: o `offboard` fecha os assentos
    // desta pessoa, e sem a trava uma entrega simultânea nasceria DEPOIS da
    // leitura dele — o desligado terminaria com assento na mão e nada acusaria.
    if (alvo.tipo === 'USER') await travarUsuarioOuFalhar(tx, alvo.id);
    else await travarAtivoOuFalhar(tx, alvo.id);

    // A licença existe? (404 antes de procurar assento em contrato nenhum.)
    // NÃO trava a licença: entregar é o caminho quente, e travá-la enfileiraria
    // todo checkout do mesmo contrato — que é exatamente o que o `SKIP LOCKED`
    // existe para evitar (D90).
    const licenca = await tx.license.findFirst({
      where: { id: licenseId },
      select: {
        id: true, name: true, seatsTotal: true,
        expirationDate: true, terminationDate: true,
      },
    });
    if (!licenca) throw new AppError('Nenhuma licença com este identificador.', 404);

    // O CONTRATO TAMBÉM É RECUSADO PELO ESTADO, não só o alvo.
    //
    // Entregar assento de licença vencida ou rescindida é registrar, no próprio
    // inventário, software em uso sem direito de uso — que é o achado mais caro
    // de uma auditoria de fornecedor, e o mesmo que `/api/licenses/alerts`
    // aponta como urgente. A tela já não oferecia o botão (`LicencaTable`,
    // `podeEntregar`); sem esta guarda a regra morava SÓ na tela, e quem chama
    // a API — ou uma tela futura — passava por cima dela sem ruído.
    //
    // `VENCENDO` entrega normalmente: é justamente a janela em que se renova
    // enquanto o contrato ainda vale.
    const status = statusDaLicenca(licenca);
    if (status === 'ENCERRADA') {
      throw new AppError(
        `A licença "${licenca.name}" está ENCERRADA (contrato rescindido) e não recebe assento `
        + 'novo. Se o contrato voltou, limpe a data de encerramento antes de entregar.',
        409,
        { status },
      );
    }
    if (status === 'EXPIRADA') {
      const dias = Math.abs(diasParaVencer(licenca.expirationDate) ?? 0);
      throw new AppError(
        `A licença "${licenca.name}" venceu há ${dias} ${dias === 1 ? 'dia' : 'dias'} e não recebe `
        + 'assento novo: renove o contrato e atualize a data de vencimento antes de entregar.',
        409,
        { status },
      );
    }

    const nomeDoAlvo = await assertAlvoApto(tx, alvo);

    // A ESCOLHA E A TRAVA, NA MESMA INSTRUÇÃO (D41). Ver `pegarAssentoLivre`:
    // escolher com um `SELECT` e travar com outro deixa a janela entre os dois.
    const assento = await pegarAssentoLivre(tx, licenseId);

    if (!assento) {
      // A contagem SÓ no caminho de erro: ela custa uma consulta e existe para
      // a frase dizer POR QUE não há assento — "5 de 5 ocupados" manda procurar
      // devoluções, "3 ocupados e 2 queimados" manda comprar. No caminho feliz
      // ela não acontece.
      const contagem = await contarAssentosDe(tx, licenseId);
      throw new AppError(
        `Sem assento livre em "${licenca.name}": ${contagem.ocupados} de ${licenca.seatsTotal} `
        + `ocupados${contagem.queimados > 0 ? `, ${contagem.queimados} queimado(s)` : ''}. `
        + 'Devolva um assento ou aumente o contrato.',
        409,
        { seatsTotal: licenca.seatsTotal, ...contagem },
      );
    }

    const checkout = await tx.licenseSeatCheckout.create({
      data: {
        seatId: assento.id,
        // As duas escritas a partir do alvo JÁ ESCOLHIDO, nunca do corpo: é o
        // que garante que a outra fique nula em vez de depender do cliente.
        assignedUserId: alvo.tipo === 'USER' ? alvo.id : null,
        assignedAssetId: alvo.tipo === 'ASSET' ? alvo.id : null,
        checkoutNotes: data.notes ?? null,
        checkoutById: actorId,
      },
      select: SEAT_CHECKOUT_SELECT,
    });

    await recordActivity(tx, {
      entityType: 'License',
      entityId: licenseId,
      action: 'CHECKOUT',
      changes: {
        checkoutId: checkout.id,
        seatId: assento.id,
        seatNumber: assento.seatNumber,
        alvo: alvo.tipo,
        alvoId: alvo.id,
        alvoNome: nomeDoAlvo,
      },
    }, actorId);

    return { ...checkout, seatNumber: assento.seatNumber };
  });
}

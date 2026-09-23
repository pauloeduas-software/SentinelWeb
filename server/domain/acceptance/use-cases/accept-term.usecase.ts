import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { apagar, gravar } from '../../../core/storage/storage';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { rotuloDoAlvoOuPadrao } from '../../assignment/helpers/target-label.helper';
import { gerarTermoPdf } from '../helpers/termo-pdf.helper';
import { expirou } from '../helpers/token.helper';

// O ACEITE — e o PDF, gerado aqui e nunca mais (D30).
//
// A ORDEM, e cada passo tem um motivo:
//
//   1. lê tudo que o documento precisa      (fora da transação: é leitura)
//   2. grava a ASSINATURA no disco          (arquivo não faz rollback)
//   3. desenha o PDF e grava no disco       (idem)
//   4. marca `acceptedAt` + os caminhos     (transação)
//   5. se a transação falhar, apaga os dois arquivos
//
// Por que o arquivo antes da linha: um `acceptedAt` gravado apontando para um
// PDF que não existe é um termo "assinado" sem documento — e o documento é a
// razão de o termo existir. Arquivo órfão no disco é invisível e recuperável.

/** A assinatura chega como data URL do `<canvas>`; aqui vira bytes. */
function bytesDaAssinatura(dataUrl: string | undefined): Buffer | null {
  if (!dataUrl) return null;
  return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
}

export async function acceptTerm(token: string, assinaturaDataUrl?: string) {
  const acceptance = await prisma.acceptance.findUnique({
    where: { token },
    select: {
      id: true,
      eulaSnapshot: true,
      signerName: true,
      signerEmail: true,
      signerUserId: true,
      acceptedAt: true,
      declinedAt: true,
      expiresAt: true,
      assetId: true,
      asset: {
        select: {
          assetTag: true,
          name: true,
          serial: true,
          model: { select: { name: true, manufacturer: { select: { name: true } } } },
        },
      },
      assignment: {
        select: {
          checkinAt: true,
          targetType: true,
          targetUser: { select: { name: true } },
          targetLocation: { select: { name: true } },
          targetAsset: { select: { assetTag: true, name: true } },
        },
      },
    },
  });

  if (!acceptance) throw new AppError('Termo não encontrado.', 404);

  // TOKEN DE USO ÚNICO. Aceitar duas vezes geraria um segundo PDF com outra
  // data e outra assinatura para o mesmo fato — e nada diria qual vale.
  if (acceptance.acceptedAt) throw new AppError('Este termo já foi aceito.', 409);
  if (acceptance.declinedAt) throw new AppError('Este termo foi recusado e não pode mais ser aceito.', 409);

  // A ENTREGA ACABOU — o termo perdeu o objeto.
  //
  // O aceite não bloqueia a entrega (D88), então o ativo pode ter sido
  // devolvido com o termo ainda por assinar. Aceitar agora produziria um PDF
  // declarando a guarda de um equipamento que já voltou, com a data de hoje: um
  // documento que prova o contrário do que aconteceu.
  if (acceptance.assignment.checkinAt) {
    throw new AppError('Este equipamento já foi devolvido: o termo não se aplica mais.', 409);
  }

  if (expirou(acceptance)) {
    throw new AppError('Este link de aceite expirou. Peça um novo ao time de TI.', 410);
  }

  const assinadoEm = new Date();
  const assinaturaPng = bytesDaAssinatura(assinaturaDataUrl);

  const assinaturaGravada = assinaturaPng
    ? await gravar('assinaturas', 'image/png', assinaturaPng)
    : null;

  const pdf = await gerarTermoPdf({
    assetTag: acceptance.asset.assetTag,
    assetName: acceptance.asset.name,
    modelo: `${acceptance.asset.model.manufacturer.name} ${acceptance.asset.model.name}`,
    serial: acceptance.asset.serial,
    signerName: acceptance.signerName,
    signerEmail: acceptance.signerEmail,
    alvo: rotuloDoAlvoOuPadrao(acceptance.assignment),
    eulaSnapshot: acceptance.eulaSnapshot,
    acceptedAt: assinadoEm,
    assinaturaPng,
  });

  const pdfGravado = await gravar('termos', 'application/pdf', pdf);

  try {
    return await prisma.$transaction(async (tx) => {
      // `updateMany` com `acceptedAt: null` no `where` é o que torna o uso
      // único ATÔMICO: dois cliques simultâneos no botão passam os dois pelo
      // `if` acima — é READ COMMITTED —, e só um casa aqui.
      const { count } = await tx.acceptance.updateMany({
        where: { id: acceptance.id, acceptedAt: null, declinedAt: null },
        data: {
          acceptedAt: assinadoEm,
          signaturePath: assinaturaGravada?.path ?? null,
          pdfPath: pdfGravado.path,
        },
      });
      if (count === 0) throw new AppError('Este termo já foi aceito.', 409);

      // NO HISTÓRICO DO ATIVO, como o checkout: é a linha do tempo do
      // equipamento que alguém abre para perguntar "quem assinou por isto?".
      //
      // `actorId` é o SIGNATÁRIO, e este é o único ponto do sistema em que o
      // ator não sai de `request.user`: a rota é pública e quem age é quem tem
      // o token. Passar `null` aqui perderia justamente o dado que o termo
      // existe para registrar.
      await recordActivity(tx, {
        entityType: 'Asset',
        entityId: acceptance.assetId,
        action: 'ACCEPT',
        changes: {
          acceptanceId: acceptance.id,
          signerName: acceptance.signerName,
          signerEmail: acceptance.signerEmail,
          comAssinatura: Boolean(assinaturaGravada),
        },
      }, acceptance.signerUserId);

      return { id: acceptance.id, acceptedAt: assinadoEm };
    });
  } catch (error) {
    await apagar(assinaturaGravada?.path);
    await apagar(pdfGravado.path);
    throw error;
  }
}

/**
 * A RECUSA. Não gera PDF: não há o que documentar num termo não aceito.
 *
 * `declinedAt` e `expiresAt` são estados diferentes e não se confundem: recusar
 * é uma DECISÃO que precisa aparecer no relatório e provocar uma conversa;
 * expirar é o prazo do link acabando, e se resolve reemitindo.
 */
export async function declineTerm(token: string, motivo: string | null) {
  const acceptance = await prisma.acceptance.findUnique({
    where: { token },
    select: {
      id: true, assetId: true, signerName: true, signerUserId: true,
      acceptedAt: true, declinedAt: true, expiresAt: true,
      assignment: { select: { checkinAt: true } },
    },
  });

  if (!acceptance) throw new AppError('Termo não encontrado.', 404);
  if (acceptance.acceptedAt) throw new AppError('Este termo já foi aceito.', 409);
  if (acceptance.declinedAt) throw new AppError('Este termo já foi recusado.', 409);
  // Recusar também perde o sentido: não há o que recusar numa entrega encerrada.
  if (acceptance.assignment.checkinAt) {
    throw new AppError('Este equipamento já foi devolvido: o termo não se aplica mais.', 409);
  }
  if (expirou(acceptance)) throw new AppError('Este link de aceite expirou.', 410);

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.acceptance.updateMany({
      where: { id: acceptance.id, acceptedAt: null, declinedAt: null },
      data: { declinedAt: new Date(), declineReason: motivo },
    });
    if (count === 0) throw new AppError('Este termo já foi respondido.', 409);

    await recordActivity(tx, {
      entityType: 'Asset',
      entityId: acceptance.assetId,
      action: 'DECLINE',
      changes: { acceptanceId: acceptance.id, signerName: acceptance.signerName, motivo },
    }, acceptance.signerUserId);

    return { id: acceptance.id, declinedAt: new Date() };
  });
}

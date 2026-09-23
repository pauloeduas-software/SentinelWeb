import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { enviar, urlDoPainel } from '../../../core/mail/mailer';
import { expirou } from '../helpers/token.helper';

// O REENVIO DO TERMO.
//
// REENVIAR É REMANDAR O E-MAIL DO MESMO TOKEN, nunca emitir um segundo termo. É
// a regra que o índice parcial `acceptances_um_pendente_por_posse` garante no
// banco: com dois pendentes para a mesma entrega existiriam DOIS tokens válidos
// para um fato, e o segundo a ser assinado sobrescreveria a leitura do primeiro
// — duas assinaturas no banco e nenhuma regra dizendo qual vale.
//
// `remindedAt` registra a última cobrança. Serve para a tela mostrar "lembrado
// há 2 dias" e para ninguém remandar três vezes na mesma manhã.

/** O corpo do e-mail de aceite — o mesmo na emissão e no reenvio. */
export function corpoDoConvite(dados: {
  signerName: string;
  assetTag: string;
  assetName: string | null;
  token: string;
}): { assunto: string; texto: string } {
  const equipamento = dados.assetName ? `${dados.assetTag} — ${dados.assetName}` : dados.assetTag;

  return {
    assunto: `Assine o termo de responsabilidade: ${equipamento}`,
    texto:
      `Olá, ${dados.signerName}.\n\n` +
      `Um equipamento foi entregue e precisa do seu aceite:\n\n` +
      `${equipamento}\n\n` +
      `Acesse para ler e assinar o termo:\n${urlDoPainel()}/aceite/${dados.token}\n\n` +
      'O link é pessoal e expira em 30 dias.\n',
  };
}

export async function remindAcceptance(id: string) {
  const acceptance = await prisma.acceptance.findUnique({
    where: { id },
    select: {
      id: true, token: true, signerName: true, signerEmail: true,
      acceptedAt: true, declinedAt: true, expiresAt: true,
      assignment: { select: { checkinAt: true } },
      asset: { select: { assetTag: true, name: true } },
    },
  });

  if (!acceptance) throw new AppError('Termo não encontrado.', 404);
  if (acceptance.acceptedAt) throw new AppError('Este termo já foi aceito.', 409);
  if (acceptance.declinedAt) throw new AppError('Este termo foi recusado.', 409);
  // Não se cobra assinatura de quem já devolveu o equipamento.
  if (acceptance.assignment.checkinAt) {
    throw new AppError('Este equipamento já foi devolvido: não há o que cobrar.', 409);
  }
  if (expirou(acceptance)) {
    throw new AppError('Este termo expirou. Devolva e entregue de novo para emitir outro.', 409);
  }

  const mensagem = corpoDoConvite({
    signerName: acceptance.signerName,
    assetTag: acceptance.asset.assetTag,
    assetName: acceptance.asset.name,
    token: acceptance.token,
  });

  await enviar({ para: [acceptance.signerEmail], ...mensagem });

  // `remindedAt` é carimbado MESMO quando o correio está em no-op: o campo
  // registra que alguém mandou cobrar, não que o e-mail chegou. Amarrá-lo ao
  // sucesso do SMTP faria o botão parecer quebrado em desenvolvimento.
  return prisma.acceptance.update({
    where: { id },
    data: { remindedAt: new Date() },
    select: { id: true, remindedAt: true },
  });
}

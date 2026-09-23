import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { expirou } from '../helpers/token.helper';

// A LEITURA DA PÁGINA PÚBLICA.
//
// Esta é a única rota do domínio sem sessão, e por isso ela devolve o MÍNIMO:
// o termo em questão e o equipamento dele. Nada de lista, nada de outro ativo,
// nada do colaborador além do nome que já está no documento que ele vai
// assinar.

export async function getAcceptanceByToken(token: string) {
  const acceptance = await prisma.acceptance.findUnique({
    where: { token },
    select: {
      id: true,
      eulaSnapshot: true,
      signerName: true,
      signerEmail: true,
      acceptedAt: true,
      declinedAt: true,
      declineReason: true,
      expiresAt: true,
      // A tela pública precisa saber que a entrega acabou para não oferecer um
      // botão que o servidor vai recusar.
      assignment: { select: { checkinAt: true } },
      asset: {
        select: {
          assetTag: true,
          name: true,
          serial: true,
          model: { select: { name: true, manufacturer: { select: { name: true } } } },
        },
      },
    },
  });

  // 404 para token inexistente E para token expirado: a página pública não
  // distingue os dois de propósito. "Este token existe mas venceu" é informação
  // que só serve a quem está varrendo tokens.
  if (!acceptance) throw new AppError('Termo não encontrado.', 404);
  if (expirou(acceptance) && !acceptance.acceptedAt) {
    throw new AppError('Este link de aceite expirou. Peça um novo ao time de TI.', 410);
  }

  return {
    ...acceptance,
    /** A entrega já foi encerrada? Então o termo perdeu o objeto (D88). */
    entregaEncerrada: acceptance.assignment.checkinAt !== null,
    modelo: `${acceptance.asset.model.manufacturer.name} ${acceptance.asset.model.name}`,
  };
}

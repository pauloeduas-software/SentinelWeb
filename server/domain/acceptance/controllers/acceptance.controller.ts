import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../../core/errors/app-error';
import { abrir, existe } from '../../../core/storage/storage';
import { prisma } from '../../../core/database/prismaClient';
import { idParamSchema } from '../../shared/params.schema';
import {
  acceptSchema, acceptanceViewQuerySchema, declineSchema, tokenParamSchema,
} from '../schemas/acceptance.schema';
import { getAcceptanceByToken } from '../use-cases/get-acceptance-by-token.usecase';
import { acceptTerm, declineTerm } from '../use-cases/accept-term.usecase';
import { listAcceptances } from '../use-cases/list-acceptances.usecase';
import { remindAcceptance } from '../use-cases/remind-acceptance.usecase';

// Só HTTP. A particularidade aqui é que TRÊS destas rotas são PÚBLICAS — as do
// token —, e é por isso que elas não leem `request.user` em lugar nenhum: não
// há sessão para ler. Quem autoriza é o token, e ele é validado por regex antes
// de virar consulta.

export const acceptanceController = {
  // ---------------------------------------------------------------- público
  async verPorToken(request: FastifyRequest) {
    const { token } = tokenParamSchema.parse(request.params);
    return getAcceptanceByToken(token);
  },

  async aceitar(request: FastifyRequest) {
    const { token } = tokenParamSchema.parse(request.params);
    const { assinatura } = acceptSchema.parse(request.body ?? {});
    return acceptTerm(token, assinatura);
  },

  async recusar(request: FastifyRequest) {
    const { token } = tokenParamSchema.parse(request.params);
    const { motivo } = declineSchema.parse(request.body ?? {});
    return declineTerm(token, motivo ?? null);
  },

  /**
   * O PDF pelo TOKEN — a via de quem assinou.
   *
   * Quem assina o termo de um posto é o gestor (D27) e pode não ter conta no
   * sistema; sem esta porta ele assinaria um documento que nunca poderia
   * reler. O mesmo token de uso único abre aqui até `expiresAt`.
   */
  async pdfPorToken(request: FastifyRequest, reply: FastifyReply) {
    const { token } = tokenParamSchema.parse(request.params);
    const acceptance = await prisma.acceptance.findUnique({
      where: { token },
      select: { pdfPath: true, asset: { select: { assetTag: true } } },
    });

    if (!acceptance?.pdfPath) throw new AppError('Este termo ainda não tem documento.', 404);
    return enviarPdf(reply, acceptance.pdfPath, acceptance.asset.assetTag);
  },

  // ----------------------------------------------------------- com sessão
  async listar(request: FastifyRequest) {
    const { view } = acceptanceViewQuerySchema.parse(request.query ?? {});
    return listAcceptances(view);
  },

  async lembrar(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return remindAcceptance(id);
  },

  async pdf(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const acceptance = await prisma.acceptance.findUnique({
      where: { id },
      select: { pdfPath: true, asset: { select: { assetTag: true } } },
    });

    if (!acceptance?.pdfPath) throw new AppError('Este termo ainda não tem documento.', 404);
    return enviarPdf(reply, acceptance.pdfPath, acceptance.asset.assetTag);
  },
};

/** O PDF sai por rota, nunca por raiz estática — D84, igual ao anexo. */
async function enviarPdf(reply: FastifyReply, caminho: string, assetTag: string) {
  if (!(await existe(caminho))) {
    throw new AppError('O documento deste termo não está mais no servidor.', 404);
  }

  return reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `inline; filename="termo-${assetTag}.pdf"`)
    .header('Cache-Control', 'private, max-age=0, no-store')
    .send(abrir(caminho));
}

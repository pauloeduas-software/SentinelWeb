import type { Prisma } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import type { ListEnvelope, ListQuery } from '../../../infra/http/list-query';
import { CHECKOUT_SELECT, rotuloDoAlvoDaEntrega } from '../helpers/license-select.helper';

// POR ONDE A LICENÇA PASSOU — o histórico do detalhe.
//
// Só movimentação: cada entrega e cada devolução, lidas de `license_checkouts`
// com o nome de quem recebeu e a observação. Cadastro, edição e encerramento
// não entram: ficam na auditoria (`audit_logs`, AB), que tela nenhuma lê.

export interface EventoDaLicenca {
  /** Uma entrega rende DOIS eventos, e o sufixo é o que os separa. */
  id: string;
  action: 'CHECKOUT' | 'CHECKIN';
  at: Date;
  entrega: {
    checkoutId: string;
    alvo: 'PERSON' | 'ASSET';
    alvoId: string;
    /** "Laura Souza", ou "ATV-00012 — Dell Latitude". */
    alvoLabel: string;
    notes: string | null;
  };
}

type Entrega = Prisma.LicenseCheckoutGetPayload<{ select: typeof CHECKOUT_SELECT }>;

/** Uma linha da página, como o banco a corta: QUAL entrega, e qual dos dois eventos dela. */
interface EventoNaPagina {
  checkoutId: string;
  action: EventoDaLicenca['action'];
}

/** Um dos dois eventos de uma entrega: a entrega, ou a devolução. */
function eventoDaEntrega(entrega: Entrega, action: EventoDaLicenca['action']): EventoDaLicenca {
  const devolucao = action === 'CHECKIN';
  return {
    id: `${entrega.id}:${devolucao ? 'devolucao' : 'entrega'}`,
    action,
    at: devolucao ? entrega.checkinAt as Date : entrega.checkoutAt,
    entrega: {
      checkoutId: entrega.id,
      alvo: entrega.assignedPersonId ? 'PERSON' : 'ASSET',
      alvoId: (entrega.assignedPersonId ?? entrega.assignedAssetId) as string,
      alvoLabel: rotuloDoAlvoDaEntrega(entrega),
      // A observação é da entrega; a devolução não tem a sua.
      notes: devolucao ? null : entrega.checkoutNotes,
    },
  };
}

/**
 * Paginado NO BANCO, do mais recente para o mais antigo.
 *
 * Uma entrega rende um ou dois eventos — a entrega sempre, a devolução se houve —,
 * então a página não sai de `license_checkouts` direto: o `UNION ALL` põe os
 * eventos lado a lado e o `LIMIT` corta a página já ordenada. Só as entregas
 * da página são lidas depois.
 *
 * No mesmo instante, a devolução vem antes da entrega ('CHECKIN' < 'CHECKOUT'):
 * a devolvida no mesmo minuto da entrega se lê de cima para baixo. `createdAt`
 * e `id` desempatam o resto, para a página não variar entre duas leituras.
 */
export async function listLicenseHistory(
  licenseId: string,
  query: Pick<ListQuery, 'skip' | 'take'>,
): Promise<ListEnvelope<EventoDaLicenca>> {
  const licenca = await prisma.license.findUnique({ where: { id: licenseId }, select: { id: true } });
  if (!licenca) throw new AppError('Nenhuma licença com este identificador.', 404);

  const [contagem, pagina] = await Promise.all([
    // Um evento por entrega, mais um por devolução.
    prisma.licenseCheckout.count({ where: { licenseId }, select: { _all: true, checkinAt: true } }),
    prisma.$queryRaw<EventoNaPagina[]>`
      SELECT "checkoutId", action FROM (
        SELECT id AS "checkoutId", 'CHECKOUT' AS action, "checkoutAt" AS at, "createdAt"
          FROM license_checkouts
         WHERE "licenseId" = ${licenseId}::uuid
        UNION ALL
        SELECT id, 'CHECKIN', "checkinAt", "createdAt"
          FROM license_checkouts
         WHERE "licenseId" = ${licenseId}::uuid AND "checkinAt" IS NOT NULL
      ) AS eventos
      ORDER BY at DESC, action ASC, "createdAt" DESC, "checkoutId" DESC
      LIMIT ${query.take}::int OFFSET ${query.skip}::bigint
    `,
  ]);

  const entregas = await prisma.licenseCheckout.findMany({
    where: { id: { in: pagina.map((linha) => linha.checkoutId) } },
    select: CHECKOUT_SELECT,
  });
  const porId = new Map(entregas.map((entrega) => [entrega.id, entrega]));

  return {
    total: contagem._all + contagem.checkinAt,
    // Entrega de licença não se apaga (FK `Restrict` em todo lado): a da página está no mapa.
    rows: pagina.map(({ checkoutId, action }) => eventoDaEntrega(porId.get(checkoutId) as Entrega, action)),
  };
}

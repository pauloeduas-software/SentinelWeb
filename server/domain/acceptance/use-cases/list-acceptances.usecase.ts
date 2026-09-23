import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope } from '../../../core/http/list-query';
import { ACCEPTANCE_SELECT } from '../helpers/acceptance-select.helper';

// O RELATÓRIO DE TERMOS — o que fecha a Etapa A da F4.
//
// Ele existe porque o aceite NÃO bloqueia a entrega (D88): o equipamento sai
// com a pendência aberta, e sem uma lista que a persiga a pendência some. É
// esta tela que transforma "não bloqueia" em "não é esquecido".

export type VistaDeAceite = 'pendentes' | 'aceitos' | 'recusados' | 'obsoletos' | 'todos';

/**
 * PENDENTE inclui o EXPIRADO, de propósito.
 *
 * Um link vencido não vira recusa — ninguém decidiu nada. Ele continua sendo um
 * termo que falta assinar, e tirá-lo daqui faria o relatório esvaziar sozinho
 * com o tempo: exatamente o defeito que a separação entre `declinedAt` e
 * `expiresAt` existe para impedir.
 *
 * PENDENTE **NÃO** inclui o termo cuja ENTREGA JÁ ACABOU, e este é o outro
 * lado da mesma régua. O aceite não bloqueia a entrega (D88), então um ativo
 * pode ser devolvido com o termo ainda por assinar — e aí o documento perdeu o
 * objeto: ele descreveria a guarda de um equipamento que voltou. Cobrar essa
 * assinatura é pedir que alguém assuma a responsabilidade por algo que não
 * está mais com ele.
 *
 * O estado é DERIVADO da posse, não uma quarta coluna. `Assignment.checkinAt`
 * já diz que a entrega acabou; um `canceledAt` aqui seria uma segunda verdade
 * sobre o mesmo fato, livre para divergir — é o D16 aplicado ao documento.
 */
const ENTREGA_ABERTA = { assignment: { checkinAt: null } } as const;

function whereDaVista(view: VistaDeAceite): Prisma.AcceptanceWhereInput {
  if (view === 'pendentes') return { acceptedAt: null, declinedAt: null, ...ENTREGA_ABERTA };
  if (view === 'aceitos') return { acceptedAt: { not: null } };
  if (view === 'recusados') return { declinedAt: { not: null } };
  // Os que ficaram para trás: nunca respondidos, e a entrega já acabou. Não
  // são cobrança — são a prova de que o processo deixou passar, e alguém
  // precisa poder olhá-los.
  if (view === 'obsoletos') {
    return { acceptedAt: null, declinedAt: null, assignment: { checkinAt: { not: null } } };
  }
  return {};
}

export async function listAcceptances(view: VistaDeAceite): Promise<ListEnvelope<unknown>> {
  const where = whereDaVista(view);

  const [total, rows] = await prisma.$transaction([
    prisma.acceptance.count({ where }),
    prisma.acceptance.findMany({
      where,
      select: ACCEPTANCE_SELECT,
      // Mais antigo primeiro nas pendências: a lista é de TRABALHO, e quem está
      // há três semanas sem assinar não pode ficar na última linha.
      orderBy: { createdAt: view === 'pendentes' ? 'asc' : 'desc' },
      take: 200,
    }),
  ]);

  return { total, rows };
}

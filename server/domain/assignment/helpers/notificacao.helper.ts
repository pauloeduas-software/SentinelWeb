import { prisma } from '../../../core/database/prismaClient';
import { enviar, urlDoPainel } from '../../../core/mail/mailer';
import { createLogger } from '../../../core/logger/logger';
import type { AlvoPosse } from '../use-cases/resolve-responsibles.usecase';

// OS AVISOS DE ENTREGA E DEVOLUÇÃO — a Etapa C da F4.
//
// TUDO AQUI RODA DEPOIS DO COMMIT, e é obrigação de quem chama garantir isso.
// SMTP não tem rollback: um e-mail disparado por transação que reverteu avisa o
// colaborador de uma entrega que não existe, e não há como desfazer.
//
// QUEM RECEBE depende do alvo, e é a Camada 3 do MODELO-POSSE.md em forma de
// destinatário:
//
//   USER      a pessoa. Um endereço.
//   LOCATION  TODOS os ocupantes abertos do posto (D27). Entregar à Mesa 1 e
//             avisar só uma delas seria escolher um responsável que o modelo
//             recusa escolher.
//   ASSET     ninguém, e é a resposta certa — o detentor é um equipamento.
//             Quem responde pelo notebook já foi avisado quando o recebeu, e
//             avisá-lo de novo por causa da dock seria ruído.

const logger = createLogger('assignment.notificacao');

/** O e-mail de quem deve saber, pelo alvo da posse. */
async function destinatarios(
  targetType: AlvoPosse,
  targetUserId: string | null,
  targetLocationId: string | null,
): Promise<string[]> {
  if (targetType === 'USER' && targetUserId) {
    const pessoa = await prisma.user.findFirst({
      where: { id: targetUserId },
      select: { email: true },
    });
    return pessoa?.email ? [pessoa.email] : [];
  }

  if (targetType === 'LOCATION' && targetLocationId) {
    const ocupantes = await prisma.locationOccupant.findMany({
      where: { locationId: targetLocationId, endedAt: null },
      select: { user: { select: { email: true } } },
    });
    return ocupantes.map((o) => o.user?.email).filter((e): e is string => Boolean(e));
  }

  return [];
}

export interface DadosDoAviso {
  assetId: string;
  assetTag: string;
  assetName: string | null;
  targetType: AlvoPosse;
  targetUserId: string | null;
  targetLocationId: string | null;
  targetLabel: string;
  notes: string | null;
  expectedCheckinAt: Date | null;
}

function etiqueta(dados: DadosDoAviso): string {
  return dados.assetName ? `${dados.assetTag} — ${dados.assetName}` : dados.assetTag;
}

function linkDoAtivo(assetId: string): string {
  return `${urlDoPainel()}/ativos/${assetId}`;
}

/** Data no formato que o Brasil lê, sem depender de `Intl` no servidor. */
function dataBR(data: Date): string {
  return data.toISOString().slice(0, 10).split('-').reverse().join('/');
}

export async function avisarEntrega(dados: DadosDoAviso): Promise<void> {
  const para = await destinatarios(dados.targetType, dados.targetUserId, dados.targetLocationId);
  if (para.length === 0) return;

  const prazo = dados.expectedCheckinAt
    ? `\nDevolução prevista: ${dataBR(dados.expectedCheckinAt)}.`
    : '';
  const observacao = dados.notes ? `\nObservações: ${dados.notes}` : '';

  // O ALVO vai no corpo mesmo quando é a própria pessoa: entregue a um posto, a
  // frase "para Mesa 1" é o que explica por que a Ana também recebeu este
  // e-mail sem ter pedido nada.
  await enviar({
    para,
    assunto: `Equipamento entregue: ${etiqueta(dados)}`,
    texto:
      `Um equipamento foi entregue para ${dados.targetLabel}.\n\n` +
      `Equipamento: ${etiqueta(dados)}${prazo}${observacao}\n\n` +
      `Detalhes: ${linkDoAtivo(dados.assetId)}\n`,
  });

  logger.debug(`[Notificação] Entrega de ${dados.assetTag} avisada a ${para.length} pessoa(s).`);
}

export async function avisarDevolucao(dados: DadosDoAviso): Promise<void> {
  const para = await destinatarios(dados.targetType, dados.targetUserId, dados.targetLocationId);
  if (para.length === 0) return;

  const observacao = dados.notes ? `\nObservações: ${dados.notes}` : '';

  await enviar({
    para,
    assunto: `Equipamento devolvido: ${etiqueta(dados)}`,
    texto:
      `A devolução foi registrada e ${dados.targetLabel} não responde mais por este equipamento.\n\n` +
      `Equipamento: ${etiqueta(dados)}${observacao}\n\n` +
      `Detalhes: ${linkDoAtivo(dados.assetId)}\n`,
  });

  logger.debug(`[Notificação] Devolução de ${dados.assetTag} avisada a ${para.length} pessoa(s).`);
}

/**
 * Dispara o aviso sem segurar quem chamou, e sem deixar a falha subir.
 *
 * `void` com `catch` em vez de `await`: a resposta HTTP da entrega não pode
 * esperar o SMTP — um servidor de e-mail lento transformaria um checkout de
 * 30 ms numa requisição de 5 segundos. E `enviar` já não lança; este `catch` é
 * a rede para o que vem ANTES dele (a consulta dos destinatários).
 */
export function dispararAviso(promessa: Promise<void>): void {
  void promessa.catch((error) => {
    logger.warn('[Notificação] Falha ao preparar o aviso.', error);
  });
}

import { $Enums } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { enviar, urlDoPainel } from '../../../core/mail/mailer';
import { enviarWebhook } from '../../../core/webhook/webhook';
import type { ConfiguracaoDoCicloDeVida } from '../../settings/helpers/lifecycle-settings.helper';
import { linhaDoAlerta, rotuloDoTipo, type PayloadDoAlerta } from '../helpers/alert-message.helper';

// O ENVIO — e ele acontece DEPOIS do commit, sobre o que ficou sem entrega.
//
// ═════════════════════════════════════════════════════════════════════════════
// `notifiedAt IS NULL` É A FILA, E ISSO SUBSTITUI UM OUTBOX (D126).
//
// O critério não é "criado nesta rodada": é "ainda não entregue". Os dois
// coincidem no dia normal e divergem no dia que importa — o SMTP fora do ar. Ali,
// as linhas ficam gravadas com `notifiedAt` nulo, o sino já as mostra, e a rodada
// de amanhã as inclui. Sem tabela de outbox, sem política de retentativa: a
// coluna nula É o estado pendente, e o job diário É a retentativa.
//
// UMA COLUNA PARA DOIS CANAIS, de propósito. `emailedAt` + `webhookedAt` seriam
// mais precisos e custariam dois estados para reconciliar, duas perguntas para o
// próximo leitor e nenhuma tela que mostre a diferença. Qual canal falhou está no
// LOG, que é onde se investiga entrega.
// ═════════════════════════════════════════════════════════════════════════════

/** Teto de linhas num aviso. Acima disto, o e-mail deixa de ser lido. */
const LINHAS_NO_CORPO = 40;

/** Teto de alertas tratados por rodada — a primeira rodada de um parque grande. */
const TETO_POR_RODADA = 200;

const SELECT = { id: true, type: true, dueAt: true, payload: true } as const;

function corpo(
  linhas: string[],
  total: number,
): string {
  const mostradas = linhas.slice(0, LINHAS_NO_CORPO);
  const restantes = total - mostradas.length;

  return (
    'Estes itens do inventário pedem atenção:\n\n'
    + `${mostradas.join('\n')}\n`
    + (restantes > 0 ? `\n…e mais ${restantes} item(ns). Veja a lista completa no painel.\n` : '')
    + `\nCentral de alertas: ${urlDoPainel()}/relatorios\n`
  );
}

function assunto(porTipo: Map<$Enums.AlertType, number>, total: number): string {
  if (porTipo.size === 1) {
    const [tipo] = [...porTipo.keys()];
    return total === 1
      ? `Sentinel: ${rotuloDoTipo(tipo).toLowerCase()}`
      : `Sentinel: ${total} × ${rotuloDoTipo(tipo).toLowerCase()}`;
  }
  return `Sentinel: ${total} alertas do inventário`;
}

/**
 * Manda o que está pendente e marca `notifiedAt`. Devolve quantos foram marcados.
 *
 * UM E-MAIL COM TODOS OS ALERTAS, e não um por alerta: quarenta avisos de
 * garantia na mesma manhã são quarenta e-mails que ninguém lê e uma conta de SMTP
 * suspensa. É a mesma escolha do lembrete de atraso da F4, que agrupa por
 * destinatário.
 *
 * `notifiedAt` só é gravado quando ALGUM canal entregou: sem canal configurado, a
 * coluna fica nula e o alerta continua pendente para sempre — o que é a verdade,
 * e o que faz o dia em que alguém configurar o SMTP entregar o acumulado.
 */
export async function notificarAlertasPendentes(
  config: ConfiguracaoDoCicloDeVida,
): Promise<number> {
  const pendentes = await prisma.alert.findMany({
    where: { notifiedAt: null },
    select: SELECT,
    orderBy: { dueAt: 'asc' },
    take: TETO_POR_RODADA,
  });

  if (pendentes.length === 0) return 0;

  // SEM CANAL, SEM TENTATIVA: montar a mensagem e chamar dois no-ops não muda
  // nada e enche o log. A coluna fica nula, que é o estado correto.
  const temEmail = config.alertEmails.some((email) => email.trim().length > 0);
  const temWebhook = Boolean(config.alertWebhookUrl?.trim());
  if (!temEmail && !temWebhook) return 0;

  const porTipo = new Map<$Enums.AlertType, number>();
  const linhas: string[] = [];

  for (const alerta of pendentes) {
    porTipo.set(alerta.type, (porTipo.get(alerta.type) ?? 0) + 1);
    linhas.push(linhaDoAlerta(alerta.type, (alerta.payload ?? {}) as PayloadDoAlerta));
  }

  const texto = corpo(linhas, pendentes.length);
  const titulo = assunto(porTipo, pendentes.length);

  // Os dois canais em paralelo: um não espera o outro, e nenhum dos dois lança
  // (os dois são best-effort com log, D86).
  const [porEmail, porWebhook] = await Promise.all([
    temEmail ? enviar({ para: config.alertEmails, assunto: titulo, texto }) : Promise.resolve(false),
    temWebhook
      ? enviarWebhook(config.alertWebhookUrl, {
        texto: `*${titulo}*\n${texto}`,
        dados: { total: pendentes.length, tipos: Object.fromEntries(porTipo) },
      })
      : Promise.resolve(false),
  ]);

  if (!porEmail && !porWebhook) return 0;

  const { count } = await prisma.alert.updateMany({
    where: { id: { in: pendentes.map((alerta) => alerta.id) } },
    data: { notifiedAt: new Date() },
  });

  return count;
}

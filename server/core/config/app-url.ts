// A URL PÚBLICA DO PAINEL — e ela não mora mais no correio.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ELA MUDOU DE CASA (F10, Etapa G).
//
// Nasceu em `core/mail/mailer.ts` porque até a F9 só o e-mail precisava de link
// absoluto: o convite do termo de entrega e o lembrete de atraso.
//
// A F10 trouxe o SEGUNDO chamador, e de outra natureza: o QR da etiqueta leva
// `${APP_URL}/ativos/:id` (D70). Um domínio de ETIQUETA importando do CORREIO
// passa no lint e mente sobre a dependência — a etiqueta não tem nada a ver com
// e-mail, as duas só precisam saber onde o painel responde.
//
// Mudar antes de existir o segundo chamador é o que a auditoria desta fase
// recomendou, e é mais barato: uma linha agora, em vez de uma seta errada que
// alguém copia depois.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A URL pública do painel, sem barra no fim.
 *
 * Sem `APP_URL`, o padrão aponta para a porta de desenvolvimento — é onde ela
 * será lida primeiro, e o log do correio no-op mostra a URL inteira, então um
 * valor errado aparece antes de ir para produção.
 *
 * ⚠️ NA ETIQUETA O PADRÃO É PIOR QUE UM ERRO DE E-MAIL: uma etiqueta impressa é
 * para durar anos colada no equipamento, e um QR que aponta para
 * `localhost:3000` é papel desperdiçado. É por isso que a tela de etiquetas
 * MOSTRA a URL que vai no QR antes de imprimir.
 */
export function urlDoPainel(): string {
  return (process.env.APP_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}

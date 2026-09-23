import nodemailer, { type Transporter } from 'nodemailer';
import { createLogger } from '../logger/logger';

// O CORREIO — um lugar só, e ele não sabe o que é entrega, devolução ou aceite.
//
// SEM SMTP CONFIGURADO, O TRANSPORTE É NO-OP QUE LOGA. Não é enfeite: silêncio
// torna "não chegou" indepurável. Com o log, quem investiga vê o destinatário,
// o assunto e a hora, e sabe na hora se o problema é o sistema (não gerou) ou o
// servidor de e-mail (gerou e não entregou).
//
// O ENVIO ACONTECE DEPOIS DO COMMIT, sempre — e isso é responsabilidade de quem
// chama, não daqui. SMTP não tem rollback: um e-mail disparado por transação
// que reverteu avisa o colaborador de uma entrega que não existe. E a recíproca
// vale: falha de envio NÃO desfaz a entrega, e é por isso que `enviar` não
// lança (D86).

const logger = createLogger('mail');

export interface Mensagem {
  para: string[];
  assunto: string;
  /** Texto puro. Cliente de e-mail corporativo bloqueia HTML com frequência. */
  texto: string;
}

let transporte: Transporter | null = null;
let iniciado = false;

/** `SMTP_URL` ausente = modo no-op. É o padrão em desenvolvimento e em teste. */
function obterTransporte(): Transporter | null {
  if (iniciado) return transporte;
  iniciado = true;

  const url = process.env.SMTP_URL?.trim();
  if (!url) {
    logger.info('[Mail] SMTP_URL não configurada: o correio roda em modo no-op (só log).');
    return null;
  }

  transporte = nodemailer.createTransport(url);
  logger.info('[Mail] Transporte SMTP configurado.');
  return transporte;
}

function remetente(): string {
  return process.env.MAIL_FROM?.trim() || 'Sentinel <nao-responda@sentinel.local>';
}

/**
 * A URL pública do painel, para os links do corpo do e-mail.
 *
 * Sem ela o e-mail sai com link relativo, que não clica em lugar nenhum. O
 * padrão aponta para a porta de desenvolvimento porque é onde ele será lido
 * primeiro — e o log do no-op mostra a URL inteira, então um valor errado
 * aparece antes de ir para produção.
 */
export function urlDoPainel(): string {
  return (process.env.APP_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * Manda uma mensagem. NUNCA lança.
 *
 * É *best-effort* com log (D86), e o preço está escrito: um aviso de entrega
 * perdido numa indisponibilidade de SMTP está perdido, e só o log sabe. Não há
 * outbox nem retentativa, porque dos quatro e-mails do sistema dois já têm
 * estado durável que os persegue — o aceite pendente aparece no relatório e tem
 * `remindedAt`; o atraso é recalculado pelo job todo dia. Um outbox custaria
 * uma tabela, um job e uma política de retentativa para proteger justamente a
 * mensagem menos importante.
 *
 * Devolve se conseguiu, para quem chama poder registrar — não para tratar erro.
 */
export async function enviar(mensagem: Mensagem): Promise<boolean> {
  const destinatarios = mensagem.para.map((e) => e.trim()).filter(Boolean);
  if (destinatarios.length === 0) {
    logger.debug(`[Mail] "${mensagem.assunto}": nenhum destinatário, nada a enviar.`);
    return false;
  }

  const transporteAtual = obterTransporte();

  if (!transporteAtual) {
    logger.info(
      `[Mail] (no-op) Para: ${destinatarios.join(', ')} | Assunto: ${mensagem.assunto}`,
      { corpo: mensagem.texto },
    );
    return false;
  }

  try {
    await transporteAtual.sendMail({
      from: remetente(),
      to: destinatarios.join(', '),
      subject: mensagem.assunto,
      text: mensagem.texto,
    });
    return true;
  } catch (error) {
    // `warn`, não `error`: o e-mail falhou, a operação de negócio não. Subir
    // para `error` faria o alarme tocar por algo que o próximo lembrete resolve.
    logger.warn(
      `[Mail] Falha ao enviar "${mensagem.assunto}" para ${destinatarios.join(', ')}.`,
      error,
    );
    return false;
  }
}

/** Só para o teste: força a releitura da `SMTP_URL` entre arquivos. */
export function reiniciarTransporte(): void {
  transporte = null;
  iniciado = false;
}

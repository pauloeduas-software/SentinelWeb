import { lookup } from 'node:dns/promises';
import { createLogger } from '../logger/logger';
import { enderecoInterno, validarDestinoDeWebhook } from './destino-seguro';

// O WEBHOOK — irmão do `mailer.ts`, e com o MESMO contrato.
//
// NÃO LANÇA, LOGA, E É BEST-EFFORT (D86, agora do outro lado do correio). Um
// gateway de Slack fora do ar não pode derrubar a rodada de alertas nem desfazer
// as linhas já gravadas: quem persiste primeiro é a central (D57), e o canal é
// entrega — não é o registro.
//
// O ENVIO ACONTECE DEPOIS DO COMMIT, sempre, e isso é responsabilidade de quem
// chama — igualzinho ao correio.
//
// Sem URL configurada, é no-op que loga em `debug`: o caminho normal de quem não
// usa webhook não pode encher o log de aviso.

const logger = createLogger('webhook');

/** Um POST de webhook é uma mensagem curta; dez segundos é generoso. */
const TIMEOUT_MS = 10_000;

export interface MensagemDeWebhook {
  /** O texto. `text` é o campo que Slack, Teams e Discord entendem sem adaptador. */
  texto: string;
  /** Contexto estruturado, para quem consome com automação do outro lado. */
  dados?: Record<string, unknown>;
}

/**
 * A SEGUNDA METADE DA DEFESA DO D126: o endereço que o DNS devolveu.
 *
 * A validação de forma (`destino-seguro.ts`) recusa `https://169.254.169.254/` e
 * `https://localhost/`. Ela NÃO recusa `https://interno.exemplo.com/` que resolve
 * para `10.0.0.5` — e é exatamente assim que um SSRF real atravessa uma allowlist
 * de nomes.
 *
 * Resolver antes de conectar fecha o caso realista. O que sobra é a janela entre
 * a resolução e a conexão (*DNS rebinding* de verdade), que só se fecha
 * conectando no IP já verificado — e isso exigiria um agente HTTP próprio. Está
 * escrito aqui para a próxima pessoa saber o que falta em vez de supor que não
 * falta nada.
 */
async function resolveParaEnderecoPublico(hostname: string): Promise<boolean> {
  try {
    const enderecos = await lookup(hostname, { all: true });
    if (enderecos.length === 0) return false;
    return enderecos.every((endereco) => !enderecoInterno(endereco.address));
  } catch (erro) {
    logger.warn(`[Webhook] Não foi possível resolver "${hostname}": ${(erro as Error).message}`);
    return false;
  }
}

/**
 * Manda a mensagem. NUNCA lança. Devolve se conseguiu, para quem chama registrar.
 *
 * `urlConfigurada` vem do banco, então a validação acontece A CADA ENVIO e não só
 * quando alguém salva a tela: um dump restaurado, um `UPDATE` manual ou uma rota
 * futura de configuração passariam por cima de uma validação que só existisse na
 * borda de escrita.
 */
export async function enviarWebhook(
  urlConfigurada: string | null,
  mensagem: MensagemDeWebhook,
): Promise<boolean> {
  if (!urlConfigurada?.trim()) {
    logger.debug('[Webhook] Nenhuma URL configurada: nada a enviar.');
    return false;
  }

  const destino = validarDestinoDeWebhook(urlConfigurada);
  if (!destino.ok) {
    // `warn` e não `debug`: alguém configurou algo que nunca vai funcionar, e o
    // log é o único lugar onde isso aparece — a rodada do job não tem tela.
    logger.warn(`[Webhook] Destino recusado (${destino.motivo}).`);
    return false;
  }

  if (!(await resolveParaEnderecoPublico(destino.url.hostname))) {
    logger.warn(
      `[Webhook] Destino recusado: "${destino.url.hostname}" resolve para endereço interno.`,
    );
    return false;
  }

  try {
    const resposta = await fetch(destino.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: mensagem.texto, ...(mensagem.dados ?? {}) }),
      // Sem seguir redirecionamento: um `302` para `http://169.254.169.254/` é o
      // desvio mais simples de toda a checagem acima.
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!resposta.ok) {
      logger.warn(`[Webhook] ${destino.url.origin} respondeu ${resposta.status}.`);
      return false;
    }

    logger.info(`[Webhook] Mensagem entregue em ${destino.url.origin}.`);
    return true;
  } catch (erro) {
    logger.error(`[Webhook] Falha ao entregar em ${destino.url.origin}:`, erro);
    return false;
  }
}

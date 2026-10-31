import type { FastifyRequest } from 'fastify';
import { origemPermitida } from '../../../infra/config/cors';
import { AppError } from '../../../infra/errors/app-error';

// O que as rotas de credencial ganham a mais que o resto da API: a checagem de
// origem, aplicada só em `/api/auth/*` e no cadastro e edição de usuário, que
// recebem senha. Não virou middleware global porque exigir `Origin` em toda rota
// quebraria o agente e qualquer integração que não seja navegador. O `no-store`,
// que morava aqui, vale para a API inteira (`infra/http/sem-cache.ts`).

/**
 * A SEGUNDA camada anti-CSRF, atrás do `SameSite` do cookie.
 *
 * Por que uma segunda: o cookie de sessão é `SameSite=Lax` e não `Strict` — em
 * desenvolvimento o painel roda na 3000 e a API na 3001, e `Strict` faria o
 * navegador simplesmente não mandar o cookie (ver session-cookie.helper.ts).
 * `Lax` já barra o POST vindo de outro site, então o buraco real é pequeno; o
 * que esta checagem acrescenta é não depender de UMA única linha de defesa
 * escrita num atributo de cookie que um ajuste futuro pode afrouxar sem que
 * ninguém perceba.
 *
 * Requisição SEM `Origin` passa, e isto é deliberado: todo navegador manda o
 * cabeçalho em POST cruzado, então quem não manda é cliente não-navegador
 * (`curl`, o harness de teste, um script de operação) — e esse cliente não
 * carrega o cookie de uma vítima para ser usado contra ela. Exigir o cabeçalho
 * aqui quebraria o teste e a automação sem fechar ataque nenhum.
 *
 * Mesma origem também passa: é o caso de produção, onde o Fastify serve o
 * painel e a API no mesmo host.
 */
export async function verificarOrigem(request: FastifyRequest): Promise<void> {
  const origin = request.headers.origin;
  if (!origin) return;

  let mesmoHost = false;
  try {
    mesmoHost = new URL(origin).host === request.headers.host;
  } catch {
    // `Origin` ilegível não é "mesma origem": cai na checagem da allowlist abaixo
    // e é recusado se não casar.
    mesmoHost = false;
  }

  if (mesmoHost || origemPermitida(origin)) return;

  throw new AppError('Origem não permitida.', 403);
}

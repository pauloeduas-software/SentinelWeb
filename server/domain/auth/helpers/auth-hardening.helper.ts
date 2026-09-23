import type { FastifyReply, FastifyRequest } from 'fastify';
import { origemPermitida } from '../../../core/config/cors';
import { AppError } from '../../../core/errors/app-error';

// O que as rotas de autenticação ganham a mais que o resto da API.
//
// São dois hooks pequenos e independentes, aplicados só em `/api/auth/*` e no
// `set-password`. Não viraram middleware global porque nenhum dos dois faz
// sentido no resto: `no-store` atrapalharia o cache do painel estático, e
// exigir `Origin` em toda rota quebraria o agente C# e qualquer integração que
// não seja navegador.

/**
 * Resposta de autenticação NUNCA pode parar em cache.
 *
 * O que sai do login é um `Set-Cookie` de sessão mais os dados do usuário. Um
 * proxy corporativo, um CDN mal configurado ou o próprio histórico do navegador
 * guardando essa resposta significa entregá-la a quem usar a mesma máquina ou
 * passar pelo mesmo intermediário depois.
 *
 * `Pragma` acompanha por causa de intermediário HTTP/1.0 antigo, que ignora
 * `Cache-Control` — custo zero e ainda aparece em rede corporativa.
 */
export async function semCache(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
}

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

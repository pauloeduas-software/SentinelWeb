import { CATALOG_SPECS } from '../../catalog/specs';
import type { Cargo } from './cargo';

// O MAPA `método + rota → cargo mínimo`, exato, sem prefixo e sem herança.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE UM MAPA CENTRAL, E NÃO UM `preHandler` POR ROTA (D137).
//
// Por rota a rota NOVA nasce **liberada**: esquecer de protegê-la não gera erro
// nenhum, só uma rota que qualquer sessão alcança. É o mesmo furo que o
// `core/http/require-auth.ts` fechou invertendo a sessão para um hook global.
//
// Aqui a inversão é a mesma, com um degrau a mais: o mapa é **conferido contra
// a tabela de rotas do Fastify no boot** (`core/http/permission-guard.ts`).
// Rota registrada sem linha aqui **derruba o processo**, com o nome dela no
// erro. O esquecimento deixa de ser uma API aberta em silêncio e passa a ser um
// boot que não sobe — que aparece no primeiro `npm test`.
//
// POR QUE EXATO E NÃO POR PREFIXO: um mapa de prefixos (`/api/assets/* →
// ADMIN`) é mais curto e destrói a garantia. `POST /api/assets/:id/wipe`
// herdaria o cargo do vizinho e passaria a existir sem ninguém declarar qual
// cargo ela exige. Verbosidade aqui é o preço da conferência.
//
// O valor da linha é o cargo MÍNIMO, e `cargoAlcanca()` faz o resto: o cargo
// maior satisfaz a linha do menor, e nenhuma linha precisa listar os dois.
//
// O CRITÉRIO, escrito uma vez aqui em vez de repetido em cada linha:
//
//   `null`     — a sessão basta. Duas rotas, e as duas são sobre si mesmo.
//   `ADMIN`    — todo o resto. É o único cargo (Z); a separação de cargos é
//                decisão a tomar.
//
// Quem RECEBE equipamento é colaborador (`/api/people`), catálogo, e não tem
// conta: não entra no mapa como cargo.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `null` é **dispensa declarada**: a rota exige sessão e nenhum cargo acima.
 *
 * É diferente de ausente. Ausente é esquecimento e derruba o boot; `null` é
 * decisão, e cada uma tem o motivo escrito ao lado.
 */
type ExigenciaDaRota = Cargo | null;

const DISPENSADAS: Record<string, ExigenciaDaRota> = {
  // Quem está logado sempre pode saber quem é e sair. Exigir cargo para ler a
  // própria sessão tornaria impossível desenhar a tela de alguém sem acesso a
  // nada — inclusive a tela que explica que ele não tem acesso a nada.
  'GET /api/auth/me': null,
  'POST /api/auth/logout': null,
};

const ROTAS: Record<string, ExigenciaDaRota> = {
  ...DISPENSADAS,

  'GET /api/assets': 'ADMIN',
  'GET /api/assets/:id': 'ADMIN',
  'GET /api/assets/:id/history': 'ADMIN',
  'GET /api/assets/options': 'ADMIN',
  'GET /api/assets/stats': 'ADMIN',
  'GET /api/search': 'ADMIN',
  'POST /api/assets': 'ADMIN',
  'PUT /api/assets/:id': 'ADMIN',
  'DELETE /api/assets/:id': 'ADMIN',
  'POST /api/assets/:id/restore': 'ADMIN',
  'POST /api/assets/:id/retire': 'ADMIN',
  'POST /api/assets/:id/unretire': 'ADMIN',
  'GET /api/assets/:id/assignments': 'ADMIN',
  'POST /api/assets/:id/checkout': 'ADMIN',
  'POST /api/assets/:id/checkin': 'ADMIN',
  'GET /api/workstations/:id/occupants': 'ADMIN',
  'POST /api/workstations/:id/occupants': 'ADMIN',
  'DELETE /api/workstations/:id/occupants/:occupantId': 'ADMIN',
  'PATCH /api/workstations/:id/occupants/:occupantId': 'ADMIN',
  'GET /api/people/:id/occupancies': 'ADMIN',
  // O POSTO: é a mesma `CatalogSpec` do catálogo, fora da lista gerada abaixo
  // porque a tela dele é Postos, não Configurações.
  'GET /api/workstations': 'ADMIN',
  'GET /api/workstations/options': 'ADMIN',
  'GET /api/workstations/:id': 'ADMIN',
  'POST /api/workstations': 'ADMIN',
  'PUT /api/workstations/:id': 'ADMIN',
  'DELETE /api/workstations/:id': 'ADMIN',
  // O ESTOQUE.
  'GET /api/stock/items': 'ADMIN',
  'GET /api/stock/items/:id': 'ADMIN',
  'GET /api/stock/items/:id/movements': 'ADMIN',
  'POST /api/stock/items': 'ADMIN',
  'PUT /api/stock/items/:id': 'ADMIN',
  'DELETE /api/stock/items/:id': 'ADMIN',
  'POST /api/stock/items/:id/restore': 'ADMIN',
  'POST /api/stock/items/:id/adjust': 'ADMIN',
  'POST /api/stock/items/:id/checkout': 'ADMIN',
  'POST /api/stock/movements/:id/checkin': 'ADMIN',
  'GET /api/licenses': 'ADMIN',
  'GET /api/licenses/:id': 'ADMIN',
  'GET /api/licenses/:id/history': 'ADMIN',
  'GET /api/licenses/:id/checkouts': 'ADMIN',
  'GET /api/licenses/alerts': 'ADMIN',
  'GET /api/assets/:id/licenses': 'ADMIN',
  'POST /api/licenses': 'ADMIN',
  'PUT /api/licenses/:id': 'ADMIN',
  'DELETE /api/licenses/:id': 'ADMIN',
  'POST /api/licenses/:id/terminate': 'ADMIN',
  'POST /api/licenses/:id/checkout': 'ADMIN',
  'POST /api/licenses/checkouts/:id/checkin': 'ADMIN',
  'PATCH /api/licenses/checkouts/:id': 'ADMIN',
  // A FICHA DO COLABORADOR — leitura: o cadastro (`/api/people`) vem gerado lá
  // embaixo, com as outras cinco abas.
  'GET /api/people/:id': 'ADMIN',
  'GET /api/people/:id/history': 'ADMIN',
  // Quem opera o sistema.
  'GET /api/users': 'ADMIN',
  'POST /api/users': 'ADMIN',
  'PUT /api/users/:id': 'ADMIN',
  'DELETE /api/users/:id': 'ADMIN',
  'GET /api/endpoints': 'ADMIN',
  'GET /api/endpoints/:id': 'ADMIN',
  'GET /api/assets/:id/machine': 'ADMIN',
  'GET /api/reconciliation/coverage': 'ADMIN',
  'GET /api/reconciliation/idle': 'ADMIN',
  'GET /api/reconciliation/suggestions': 'ADMIN',
  'POST /api/reconciliation/run': 'ADMIN',
  'POST /api/reconciliation/suggestions/:id/accept': 'ADMIN',
  'POST /api/reconciliation/suggestions/:id/reject': 'ADMIN',
  'POST /api/endpoints/:id/link': 'ADMIN',
  'POST /api/endpoints/:id/link-and-checkout': 'ADMIN',
  'DELETE /api/endpoints/:id/link': 'ADMIN',
  'PATCH /api/endpoints/:id/review': 'ADMIN',
  'POST /api/endpoints/:id/command': 'ADMIN',
  'GET /api/settings/next-asset-tag': 'ADMIN',
  'GET /api/settings/discovery': 'ADMIN',
  'PUT /api/settings/discovery': 'ADMIN',

  // ── O CATÁLOGO, gerado ────────────────────────────────────────────────────
  //
  // As especificações do catálogo (D9) registram rotas idênticas por entidade:
  // listar, opções, criar, editar, apagar. Declará-las à mão seria repetir o
  // mesmo bloco seis vezes e deixar a sétima de fora quando alguém acrescentar
  // uma spec — exatamente o esquecimento que o D137 existe para pegar.
  //
  // A exclusão é guardada pelo 409 de uso (D8), e o colaborador vai para a
  // lixeira (V).
  ...Object.fromEntries(
    CATALOG_SPECS.flatMap((spec) => [
      [`GET /api/${spec.slug}`, 'ADMIN' as const],
      [`GET /api/${spec.slug}/options`, 'ADMIN' as const],
      [`POST /api/${spec.slug}`, 'ADMIN' as const],
      [`PUT /api/${spec.slug}/:id`, 'ADMIN' as const],
      [`DELETE /api/${spec.slug}/:id`, 'ADMIN' as const],
      // Restaurar, só na tabela com lixeira — o colaborador.
      ...(spec.lixeira ? [[`POST /api/${spec.slug}/:id/restore`, 'ADMIN' as const] as const] : []),
    ]),
  ),
};

export const ROTAS_POR_PERMISSAO: Readonly<Record<string, ExigenciaDaRota>> = ROTAS;

/** A chave do mapa: `MÉTODO /padrão`, com o método em maiúsculas. */
function chaveDaRota(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}

/**
 * O cargo mínimo da rota, `null` para dispensa declarada, `undefined` para
 * **não declarada** — que é o que a conferência do boot procura.
 */
export function exigenciaDaRota(method: string, url: string): ExigenciaDaRota | undefined {
  const chave = chaveDaRota(method, url);
  return chave in ROTAS ? ROTAS[chave] : undefined;
}

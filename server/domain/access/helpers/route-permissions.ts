import { CATALOG_SPECS } from '../../catalog/specs';
import type { Papel } from './papel';

// O MAPA `método + rota → papel mínimo`, exato, sem prefixo e sem herança.
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
// TECNICO`) é mais curto e destrói a garantia. `POST /api/assets/:id/wipe`
// herdaria o papel do vizinho e passaria a existir protegida pelo papel errado,
// sem ninguém declarar nada. Verbosidade aqui é o preço da conferência.
//
// O QUE MUDOU NO D148: o valor da linha era uma chave de permissão nomeada
// (`assets.view`, `licenses.viewKey`) resolvida contra a união dos grupos da
// sessão. Agora é o papel MÍNIMO, e `papelAlcanca()` faz o resto — `ADMIN`
// satisfaz linha de `TECNICO`, e nenhuma linha precisa listar os dois.
//
// O CRITÉRIO das 123 linhas, escrito uma vez aqui em vez de repetido em cada:
//
//   `null`     — a sessão basta. Duas rotas, e as duas são sobre si mesmo.
//   `TECNICO`  — todo o inventário: ver, criar, editar, entregar, devolver,
//                aposentar, reconciliar, exportar. É o trabalho do dia.
//   `ADMIN`    — gente (criar, editar, desligar, trocar senha), configuração do
//                sistema, EXCLUIR de verdade (e restaurar o excluído), e os três
//                segredos: custo, chave de licença e dado sensível.
//
// `users.view` ficou em `TECNICO` de propósito: entregar equipamento exige
// escolher a pessoa, e um técnico que não lista gente não faz checkout. O que é
// de `ADMIN` é MEXER em gente, não vê-la.
//
// Aposentar ficou em `TECNICO` embora a chave antiga fosse `assets.delete`:
// aposentadoria é ciclo de vida (D19), e a decisão de que `retiredAt` não é
// exclusão está escrita lá. Quem apaga de verdade é `ADMIN`.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `null` é **dispensa declarada**: a rota exige sessão e nenhum papel acima.
 *
 * É diferente de ausente. Ausente é esquecimento e derruba o boot; `null` é
 * decisão, e cada uma tem o motivo escrito ao lado.
 */
export type ExigenciaDaRota = Papel | null;

const DISPENSADAS: Record<string, ExigenciaDaRota> = {
  // Quem está logado sempre pode saber quem é e sair. Exigir papel para ler a
  // própria sessão tornaria impossível desenhar a tela de alguém sem acesso a
  // nada — inclusive a tela que explica que ele não tem acesso a nada.
  'GET /api/auth/me': null,
  'POST /api/auth/logout': null,
};

const ROTAS: Record<string, ExigenciaDaRota> = {
  ...DISPENSADAS,

  'GET /api/assets': 'TECNICO',
  'GET /api/assets/:id': 'TECNICO',
  'GET /api/assets/:id/history': 'TECNICO',
  'GET /api/assets/by-serial/:serial': 'TECNICO',
  'GET /api/assets/options': 'TECNICO',
  'GET /api/assets/stats': 'TECNICO',
  'POST /api/assets/resolve-tags': 'TECNICO',
  'GET /api/search': 'TECNICO',
  'POST /api/assets': 'TECNICO',
  'POST /api/assets/bulk': 'TECNICO',
  'PUT /api/assets/:id': 'TECNICO',
  'DELETE /api/assets/:id': 'ADMIN',
  'POST /api/assets/:id/restore': 'ADMIN',
  'POST /api/assets/:id/retire': 'TECNICO',
  'POST /api/assets/:id/unretire': 'TECNICO',
  'GET /api/assets/export': 'TECNICO',
  'GET /api/assets/:id/assignments': 'TECNICO',
  'GET /api/assignments/overdue': 'TECNICO',
  'GET /api/users/:id/holdings': 'TECNICO',
  'POST /api/assets/:id/checkout': 'TECNICO',
  'POST /api/assets/:id/checkin': 'TECNICO',
  'POST /api/assets/bulk-checkout': 'TECNICO',
  'GET /api/locations/:id/occupants': 'TECNICO',
  'POST /api/locations/:id/occupants': 'TECNICO',
  'DELETE /api/locations/:id/occupants/:occupantId': 'TECNICO',
  'GET /api/users/:id/occupancies': 'TECNICO',
  'GET /api/workstations': 'TECNICO',
  'GET /api/workstations/:id': 'TECNICO',
  'GET /api/assets/:id/attachments': 'TECNICO',
  'GET /api/attachments/:id/download': 'TECNICO',
  'POST /api/assets/:id/attachments': 'TECNICO',
  'DELETE /api/attachments/:id': 'TECNICO',
  'GET /api/images/:alvo/:id': 'TECNICO',
  'PUT /api/images/:alvo/:id': 'TECNICO',
  'DELETE /api/images/:alvo/:id': 'TECNICO',
  'POST /api/assets/:id/audit': 'TECNICO',
  'POST /api/locations/:id/auditoria': 'TECNICO',
  'POST /api/assets/:id/maintenances': 'TECNICO',
  'GET /api/licenses': 'TECNICO',
  'GET /api/licenses/:id': 'TECNICO',
  'GET /api/licenses/:id/history': 'TECNICO',
  'GET /api/licenses/:id/seats': 'TECNICO',
  'GET /api/licenses/alerts': 'TECNICO',
  'GET /api/assets/:id/licenses': 'TECNICO',
  'POST /api/licenses': 'TECNICO',
  'PUT /api/licenses/:id': 'TECNICO',
  'DELETE /api/licenses/:id': 'ADMIN',
  'POST /api/licenses/:id/restore': 'ADMIN',
  'POST /api/licenses/:id/checkout-seat': 'TECNICO',
  'POST /api/licenses/seats/:id/checkin': 'TECNICO',
  'GET /api/licenses/:id/product-key': 'ADMIN',
  'GET /api/licenses/export': 'TECNICO',
  'GET /api/accessories': 'TECNICO',
  'GET /api/accessories/:id': 'TECNICO',
  'GET /api/accessories/:id/checkouts': 'TECNICO',
  'GET /api/accessories/:id/movements': 'TECNICO',
  'POST /api/accessories': 'TECNICO',
  'PUT /api/accessories/:id': 'TECNICO',
  'POST /api/accessories/:id/adjust-quantity': 'TECNICO',
  'DELETE /api/accessories/:id': 'ADMIN',
  'POST /api/accessories/:id/restore': 'ADMIN',
  'POST /api/accessories/:id/checkout': 'TECNICO',
  'POST /api/accessories/checkouts/:id/checkin': 'TECNICO',
  'GET /api/consumables': 'TECNICO',
  'GET /api/consumables/:id': 'TECNICO',
  'GET /api/consumables/:id/movements': 'TECNICO',
  'POST /api/consumables': 'TECNICO',
  'PUT /api/consumables/:id': 'TECNICO',
  'POST /api/consumables/:id/adjust-quantity': 'TECNICO',
  'DELETE /api/consumables/:id': 'ADMIN',
  'POST /api/consumables/:id/restore': 'ADMIN',
  'POST /api/consumables/:id/consume': 'TECNICO',
  'GET /api/components': 'TECNICO',
  'GET /api/components/:id': 'TECNICO',
  'GET /api/components/:id/movements': 'TECNICO',
  'GET /api/assets/:id/components': 'TECNICO',
  'POST /api/components': 'TECNICO',
  'PUT /api/components/:id': 'TECNICO',
  'POST /api/components/:id/adjust-quantity': 'TECNICO',
  'DELETE /api/components/:id': 'ADMIN',
  'POST /api/components/:id/restore': 'ADMIN',
  'POST /api/components/:id/attach': 'TECNICO',
  'POST /api/components/attachments/:id/detach': 'TECNICO',
  'GET /api/stock/alerts': 'TECNICO',
  'GET /api/users': 'TECNICO',
  'GET /api/users/:id': 'TECNICO',
  'GET /api/users/:id/history': 'TECNICO',
  'GET /api/users/options': 'TECNICO',
  'POST /api/users': 'ADMIN',
  'PUT /api/users/:id': 'ADMIN',
  'DELETE /api/users/:id': 'ADMIN',
  'POST /api/users/:id/restore': 'ADMIN',
  'POST /api/users/:id/offboard': 'ADMIN',
  'GET /api/users/:id/reports': 'TECNICO',
  'POST /api/users/:id/set-password': 'ADMIN',
  'GET /api/endpoints': 'TECNICO',
  'GET /api/assets/:id/machine': 'TECNICO',
  'GET /api/reconciliation/coverage': 'TECNICO',
  'GET /api/reconciliation/idle': 'TECNICO',
  'GET /api/reconciliation/suggestions': 'TECNICO',
  'POST /api/reconciliation/suggestions/:id/accept': 'TECNICO',
  'POST /api/reconciliation/suggestions/:id/reject': 'TECNICO',
  'GET /api/software-packages': 'TECNICO',
  'GET /api/licenses/:id/compliance': 'TECNICO',
  'GET /api/licenses/:id/software': 'TECNICO',
  'PUT /api/licenses/:id/software': 'TECNICO',
  'POST /api/endpoints/:id/link': 'TECNICO',
  'DELETE /api/endpoints/:id/link': 'TECNICO',
  'POST /api/endpoints/:id/merge': 'TECNICO',
  'PATCH /api/endpoints/:id/review': 'TECNICO',
  'POST /api/endpoints/:hwid/command': 'TECNICO',
  'GET /api/reports/prazos': 'TECNICO',
  'GET /api/reports/responsabilidade': 'TECNICO',
  'GET /api/settings': 'TECNICO',
  'GET /api/settings/next-asset-tag': 'TECNICO',
  'GET /api/settings/branding/:marca': 'TECNICO',
  'GET /api/settings/discovery': 'TECNICO',
  'PUT /api/settings': 'ADMIN',
  'PUT /api/settings/branding/:marca': 'ADMIN',
  'DELETE /api/settings/branding/:marca': 'ADMIN',
  'PUT /api/settings/discovery': 'ADMIN',

  // ── O CATÁLOGO, gerado ────────────────────────────────────────────────────
  //
  // As especificações do catálogo (D9) registram rotas idênticas por entidade:
  // listar, opções, criar, editar, apagar. Declará-las à mão seria repetir o
  // mesmo bloco nove vezes e deixar a décima de fora quando alguém acrescentar
  // uma spec — exatamente o esquecimento que o D137 existe para pegar.
  //
  // Ler é do técnico (ele escolhe categoria e modelo ao cadastrar); MEXER no
  // catálogo é do administrador, porque é a forma do inventário inteiro.
  ...Object.fromEntries(
    CATALOG_SPECS.flatMap((spec) => [
      [`GET /api/${spec.slug}`, 'TECNICO' as const],
      [`GET /api/${spec.slug}/options`, 'TECNICO' as const],
      [`POST /api/${spec.slug}`, 'ADMIN' as const],
      [`PUT /api/${spec.slug}/:id`, 'ADMIN' as const],
      [`DELETE /api/${spec.slug}/:id`, 'ADMIN' as const],
    ]),
  ),
};

export const ROTAS_POR_PERMISSAO: Readonly<Record<string, ExigenciaDaRota>> = ROTAS;

/** A chave do mapa: `MÉTODO /padrão`, com o método em maiúsculas. */
export function chaveDaRota(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}

/**
 * O papel mínimo da rota, `null` para dispensa declarada, `undefined` para
 * **não declarada** — que é o que a conferência do boot procura.
 */
export function exigenciaDaRota(method: string, url: string): ExigenciaDaRota | undefined {
  const chave = chaveDaRota(method, url);
  return chave in ROTAS ? ROTAS[chave] : undefined;
}

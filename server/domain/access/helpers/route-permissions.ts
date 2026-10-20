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
// TECNICO`) é mais curto e destrói a garantia. `POST /api/assets/:id/wipe`
// herdaria o cargo do vizinho e passaria a existir protegida pelo cargo errado,
// sem ninguém declarar nada. Verbosidade aqui é o preço da conferência.
//
// O valor da linha é o cargo MÍNIMO, e `cargoAlcanca()` faz o resto: `ADMIN`
// satisfaz linha de `TECNICO`, e nenhuma linha precisa listar os dois.
//
// O CRITÉRIO, escrito uma vez aqui em vez de repetido em cada linha:
//
//   `null`     — a sessão basta. Duas rotas, e as duas são sobre si mesmo.
//   `TECNICO`  — todo o inventário: ver, criar, editar, entregar, devolver,
//                aposentar, reconciliar. É o trabalho do dia.
//   `ADMIN`    — usuários (criar, editar, desativar, trocar senha), configuração
//                do sistema — colaboradores inclusive —, EXCLUIR de verdade (e
//                restaurar o excluído) e o custo.
//
// A tela de Usuários — quem opera o sistema — é toda `ADMIN`, leitura
// inclusive. Quem RECEBE equipamento é colaborador (`/api/people`), catálogo:
// o técnico o escolhe no `/options` para fazer a entrega.
//
// Aposentar ficou em `TECNICO` embora a chave antiga fosse `assets.delete`:
// aposentadoria é ciclo de vida (D19), e a decisão de que `retiredAt` não é
// exclusão está escrita lá. Quem apaga de verdade é `ADMIN`.
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

  'GET /api/assets': 'TECNICO',
  'GET /api/assets/:id': 'TECNICO',
  'GET /api/assets/:id/history': 'TECNICO',
  'GET /api/assets/options': 'TECNICO',
  'GET /api/assets/stats': 'TECNICO',
  'GET /api/search': 'TECNICO',
  'POST /api/assets': 'TECNICO',
  'PUT /api/assets/:id': 'TECNICO',
  'DELETE /api/assets/:id': 'ADMIN',
  'POST /api/assets/:id/restore': 'ADMIN',
  'POST /api/assets/:id/retire': 'TECNICO',
  'POST /api/assets/:id/unretire': 'TECNICO',
  'GET /api/assets/:id/assignments': 'TECNICO',
  'POST /api/assets/:id/checkout': 'TECNICO',
  'POST /api/assets/:id/checkin': 'TECNICO',
  'GET /api/workstations/:id/occupants': 'TECNICO',
  'POST /api/workstations/:id/occupants': 'TECNICO',
  'DELETE /api/workstations/:id/occupants/:occupantId': 'TECNICO',
  'PATCH /api/workstations/:id/occupants/:occupantId': 'TECNICO',
  'GET /api/people/:id/occupancies': 'TECNICO',
  // O POSTO: ler é do técnico, que entrega e ocupa; o CADASTRO é do ADMIN,
  // como o do catálogo — é a mesma `CatalogSpec`, fora da lista gerada abaixo
  // só porque a tela dele é Postos, não Configurações.
  'GET /api/workstations': 'TECNICO',
  'GET /api/workstations/options': 'TECNICO',
  'GET /api/workstations/:id': 'TECNICO',
  'POST /api/workstations': 'ADMIN',
  'PUT /api/workstations/:id': 'ADMIN',
  'DELETE /api/workstations/:id': 'ADMIN',
  // O ESTOQUE: o trabalho do dia é do técnico; apagar e restaurar, do ADMIN,
  // como no ativo.
  'GET /api/stock/items': 'TECNICO',
  'GET /api/stock/items/:id': 'TECNICO',
  'GET /api/stock/items/:id/movements': 'TECNICO',
  'POST /api/stock/items': 'TECNICO',
  'PUT /api/stock/items/:id': 'TECNICO',
  'DELETE /api/stock/items/:id': 'ADMIN',
  'POST /api/stock/items/:id/restore': 'ADMIN',
  'POST /api/stock/items/:id/adjust': 'TECNICO',
  'POST /api/stock/items/:id/checkout': 'TECNICO',
  'POST /api/stock/movements/:id/checkin': 'TECNICO',
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
  // A FICHA DO COLABORADOR — leitura, como o resto do catálogo: o cadastro
  // (`/api/people`) vem gerado lá embaixo, com as outras cinco abas.
  'GET /api/people/:id': 'TECNICO',
  'GET /api/people/:id/history': 'TECNICO',
  // Quem opera o sistema: tudo `ADMIN`, leitura inclusive.
  'GET /api/users': 'ADMIN',
  'POST /api/users': 'ADMIN',
  'PUT /api/users/:id': 'ADMIN',
  'DELETE /api/users/:id': 'ADMIN',
  'GET /api/endpoints': 'TECNICO',
  'GET /api/endpoints/:id': 'TECNICO',
  'GET /api/assets/:id/machine': 'TECNICO',
  'GET /api/reconciliation/coverage': 'TECNICO',
  'GET /api/reconciliation/idle': 'TECNICO',
  'GET /api/reconciliation/suggestions': 'TECNICO',
  // Varrer a frota inteira é operação de administração, não do chamado do dia.
  'POST /api/reconciliation/run': 'ADMIN',
  'POST /api/reconciliation/suggestions/:id/accept': 'TECNICO',
  'POST /api/reconciliation/suggestions/:id/reject': 'TECNICO',
  'POST /api/endpoints/:id/link': 'TECNICO',
  'POST /api/endpoints/:id/link-and-checkout': 'TECNICO',
  'DELETE /api/endpoints/:id/link': 'TECNICO',
  'PATCH /api/endpoints/:id/review': 'TECNICO',
  'POST /api/endpoints/:id/command': 'TECNICO',
  'GET /api/settings/next-asset-tag': 'TECNICO',
  'GET /api/settings/discovery': 'TECNICO',
  'PUT /api/settings/discovery': 'ADMIN',

  // ── O CATÁLOGO, gerado ────────────────────────────────────────────────────
  //
  // As especificações do catálogo (D9) registram rotas idênticas por entidade:
  // listar, opções, criar, editar, apagar. Declará-las à mão seria repetir o
  // mesmo bloco seis vezes e deixar a sétima de fora quando alguém acrescentar
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

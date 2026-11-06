import { CATALOG_SPECS } from '../../catalog/specs';
import type { Cargo } from './cargo';

// O MAPA `método + rota → cargo mínimo`, exato, sem prefixo e sem herança.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE UM MAPA CENTRAL, E NÃO UM `preHandler` POR ROTA (D137).
//
// Por rota a rota NOVA nasce **liberada**: esquecer de protegê-la não gera erro
// nenhum, só uma rota que qualquer sessão alcança. É o mesmo furo que o
// `infra/http/require-auth.ts` fechou invertendo a sessão para um hook global.
//
// Aqui a inversão é a mesma, com um degrau a mais: o mapa é **conferido contra
// a tabela de rotas do Fastify no boot** (`infra/http/permission-guard.ts`).
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
//   `null`       — a sessão basta. Quatro rotas, e todas são sobre si mesmo.
//   `TECNICO`    — o dia a dia: ler, cadastrar e editar computador, item de
//                  estoque e colaborador, entregar, devolver, ocupar posto e
//                  vincular a máquina descoberta (AV).
//   `SUPERVISOR` — o que apaga ou fecha registro (excluir, lixeira, baixa,
//                  encerrar), o dinheiro (licença; o custo é o D77), a estrutura
//                  (posto, catálogo) e o que age sobre o sistema ou a máquina
//                  (comando, reconciliar, configurar a descoberta). Desativar vai
//                  pelo `PUT` de edição, então o controller confere à parte.
//   `ADMIN`      — as contas: Usuários.
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

/** O catálogo que o Técnico cadastra e edita: o colaborador. O resto é Configurações. */
const CADASTRO_DO_TECNICO: ReadonlySet<string> = new Set(['people']);

const DISPENSADAS: Record<string, ExigenciaDaRota> = {
  // Quem está logado sempre pode saber quem é e sair. Exigir cargo para ler a
  // própria sessão tornaria impossível desenhar a tela de alguém sem acesso a
  // nada — inclusive a tela que explica que ele não tem acesso a nada.
  'GET /api/auth/me': null,
  'POST /api/auth/logout': null,
  // Minha conta (AR): cada um edita o próprio nome e troca a própria senha. O id
  // vem da sessão, nunca do caminho, então não há como mexer na conta de outro.
  'PATCH /api/auth/me': null,
  'PUT /api/auth/password': null,
};

const ROTAS: Record<string, ExigenciaDaRota> = {
  ...DISPENSADAS,

  'GET /api/assets': 'TECNICO',
  'GET /api/assets/:id': 'TECNICO',
  'GET /api/assets/:id/history': 'TECNICO',
  'GET /api/assets/options': 'TECNICO',
  'GET /api/assets/stats': 'TECNICO',
  'POST /api/assets': 'TECNICO',
  'PUT /api/assets/:id': 'TECNICO',
  'DELETE /api/assets/:id': 'SUPERVISOR',
  'POST /api/assets/:id/restore': 'SUPERVISOR',
  'POST /api/assets/:id/retire': 'SUPERVISOR',
  'POST /api/assets/:id/unretire': 'SUPERVISOR',
  'GET /api/assets/:id/assignments': 'TECNICO',
  'POST /api/assets/:id/checkout': 'TECNICO',
  'POST /api/assets/:id/checkin': 'TECNICO',
  'GET /api/workstations/:id/occupants': 'TECNICO',
  'POST /api/workstations/:id/occupants': 'TECNICO',
  'DELETE /api/workstations/:id/occupants/:occupantId': 'TECNICO',
  'PATCH /api/workstations/:id/occupants/:occupantId': 'TECNICO',
  'GET /api/people/:id/occupancies': 'TECNICO',
  // O POSTO: é a mesma `CatalogSpec` do catálogo, fora da lista gerada abaixo
  // porque a tela dele é Postos, não Configurações.
  'GET /api/workstations': 'TECNICO',
  'GET /api/workstations/options': 'TECNICO',
  'GET /api/workstations/stats': 'TECNICO',
  'GET /api/workstations/:id': 'TECNICO',
  'POST /api/workstations': 'SUPERVISOR',
  'PUT /api/workstations/:id': 'SUPERVISOR',
  'DELETE /api/workstations/:id': 'SUPERVISOR',
  // O ESTOQUE.
  'GET /api/stock/items': 'TECNICO',
  'GET /api/stock/items/:id': 'TECNICO',
  'GET /api/stock/items/:id/checkouts': 'TECNICO',
  'GET /api/stock/items/:id/history': 'TECNICO',
  'POST /api/stock/items': 'TECNICO',
  'PUT /api/stock/items/:id': 'TECNICO',
  'DELETE /api/stock/items/:id': 'SUPERVISOR',
  'POST /api/stock/items/:id/checkout': 'TECNICO',
  'POST /api/stock/checkouts/:id/checkin': 'TECNICO',
  'GET /api/assets/:id/components': 'TECNICO',
  'GET /api/licenses': 'TECNICO',
  'GET /api/licenses/:id': 'TECNICO',
  'GET /api/licenses/:id/history': 'TECNICO',
  'GET /api/licenses/:id/checkouts': 'TECNICO',
  'GET /api/licenses/alerts': 'TECNICO',
  'GET /api/licenses/stats': 'TECNICO',
  'GET /api/assets/:id/licenses': 'TECNICO',
  'POST /api/licenses': 'SUPERVISOR',
  'PUT /api/licenses/:id': 'SUPERVISOR',
  'DELETE /api/licenses/:id': 'SUPERVISOR',
  'POST /api/licenses/:id/terminate': 'SUPERVISOR',
  'POST /api/licenses/:id/checkout': 'TECNICO',
  'POST /api/licenses/checkouts/:id/checkin': 'TECNICO',
  'PATCH /api/licenses/checkouts/:id': 'TECNICO',
  // A FICHA DO COLABORADOR — leitura: o cadastro (`/api/people`) vem gerado lá
  // embaixo, com as outras seis tabelas.
  'GET /api/people/:id': 'TECNICO',
  'GET /api/people/:id/history': 'TECNICO',
  // Quem opera o sistema.
  'GET /api/users': 'ADMIN',
  'POST /api/users': 'ADMIN',
  'PUT /api/users/:id': 'ADMIN',
  'DELETE /api/users/:id': 'ADMIN',
  'POST /api/users/:id/temporary-password': 'ADMIN',
  'GET /api/endpoints': 'TECNICO',
  'GET /api/endpoints/:id': 'TECNICO',
  'GET /api/assets/:id/machine': 'TECNICO',
  'GET /api/reconciliation/coverage': 'TECNICO',
  'GET /api/reconciliation/idle': 'TECNICO',
  'GET /api/reconciliation/suggestions': 'TECNICO',
  'POST /api/reconciliation/run': 'SUPERVISOR',
  'POST /api/reconciliation/suggestions/:id/accept': 'TECNICO',
  'POST /api/reconciliation/suggestions/:id/reject': 'TECNICO',
  'POST /api/endpoints/:id/link': 'TECNICO',
  'POST /api/endpoints/:id/link-and-checkout': 'TECNICO',
  'DELETE /api/endpoints/:id/link': 'TECNICO',
  'PATCH /api/endpoints/:id/review': 'TECNICO',
  'POST /api/endpoints/:id/command': 'SUPERVISOR',
  'GET /api/settings/next-asset-tag': 'TECNICO',
  'GET /api/settings/discovery': 'TECNICO',
  'PUT /api/settings/discovery': 'SUPERVISOR',

  // ── O CATÁLOGO, gerado ────────────────────────────────────────────────────
  //
  // As especificações do catálogo (D9) registram rotas idênticas por entidade:
  // listar, opções, criar, editar, apagar. Declará-las à mão seria repetir o
  // mesmo bloco sete vezes e deixar a oitava de fora quando alguém acrescentar
  // uma spec — exatamente o esquecimento que o D137 existe para pegar.
  //
  // A exclusão é guardada pelo 409 de uso (D8), e o colaborador vai para a
  // lixeira (V).
  //
  // LER é do Técnico em todas: os formulários dele escolhem categoria, modelo e
  // localização. ESCREVER é do Supervisor (a página Configurações), menos o
  // colaborador, que o Técnico cadastra e edita no dia a dia (AV).
  ...Object.fromEntries(
    CATALOG_SPECS.flatMap((spec) => {
      const escrita: Cargo = CADASTRO_DO_TECNICO.has(spec.slug) ? 'TECNICO' : 'SUPERVISOR';
      return [
        [`GET /api/${spec.slug}`, 'TECNICO' as const],
        [`GET /api/${spec.slug}/options`, 'TECNICO' as const],
        [`POST /api/${spec.slug}`, escrita],
        [`PUT /api/${spec.slug}/:id`, escrita],
        [`DELETE /api/${spec.slug}/:id`, 'SUPERVISOR' as const],
        // Restaurar, só na tabela com lixeira — o colaborador.
        ...(spec.lixeira ? [[`POST /api/${spec.slug}/:id/restore`, 'SUPERVISOR' as const] as const] : []),
      ];
    }),
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

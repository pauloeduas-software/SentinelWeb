import { CATALOG_SPECS } from '../../catalog/specs';
import type { Permissao } from './permission-catalog';

// O MAPA `método + rota → chave`, exato, sem prefixo e sem herança.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE UM MAPA CENTRAL, E NÃO UM `preHandler` POR ROTA (D137).
//
// O plano da fase mandava escrever o `preHandler` rota por rota, dentro de cada
// maestro. São mais de duzentas rotas em 23 maestros, e por rota a rota NOVA
// nasce **liberada**: esquecer de protegê-la não gera erro nenhum, só uma rota
// que qualquer sessão alcança. É exatamente o furo que o
// `core/http/require-auth.ts` fechou invertendo a sessão para um hook global —
// com a lógica escrita lá, ao lado do porquê.
//
// Aqui a inversão é a mesma, com um degrau a mais: o mapa é **conferido contra
// a tabela de rotas do Fastify no boot** (`core/http/permission-guard.ts`).
// Rota registrada sem linha aqui **derruba o processo**, com o nome dela no
// erro. O esquecimento deixa de ser uma API aberta em silêncio e passa a ser um
// boot que não sobe — que aparece no primeiro `npm test`.
//
// POR QUE EXATO E NÃO POR PREFIXO: um mapa de prefixos (`/api/assets/* →
// assets.view`) é mais curto e destrói a garantia. `POST /api/assets/:id/wipe`
// herdaria a chave do vizinho e passaria a existir protegida pela permissão
// errada, sem ninguém declarar nada. Verbosidade aqui é o preço da conferência.
//
// POR QUE AS CHAVES SÃO `MÉTODO /rota` COM O PADRÃO DO FASTIFY: o que chega em
// `request.routeOptions.url` é o padrão (`/api/users/:id`), não a URL concreta
// (`/api/users/8ac3…`). Comparar com a URL real exigiria casar parâmetro, que é
// trabalho que o roteador já fez.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `null` é **dispensa declarada**: a rota exige sessão e nenhuma permissão.
 *
 * É diferente de ausente. Ausente é esquecimento e derruba o boot; `null` é
 * decisão, e cada uma tem o motivo escrito ao lado. São poucas de propósito —
 * dispensa é a exceção, e a lista inteira cabe num olhar.
 */
export type ExigenciaDaRota = Permissao | null;

const DISPENSADAS: Record<string, ExigenciaDaRota> = {
  // Quem está logado sempre pode saber quem é e sair. Exigir permissão para ler
  // a própria sessão tornaria impossível desenhar a tela de alguém sem chave
  // nenhuma — inclusive a tela que explica que ele não tem acesso a nada.
  'GET /api/auth/me': null,
  'POST /api/auth/logout': null,

  // Lista de opções do próprio catálogo de permissões, para a tela de grupos
  // desenhar as caixas. É o conteúdo de `permission-catalog.ts` — código
  // público, não dado de ninguém.
  'GET /api/permissions': null,

  // ── AS ROTAS SOBRE SI MESMO (F11, Etapa H) ────────────────────────────────
  //
  // SEM CHAVE, E NÃO POR ESQUECIMENTO: elas não leem id nenhum da URL — o dono
  // sai da sessão. Uma chave aqui (`me.manage`, por exemplo) só poderia ser dada
  // a todo mundo, porque trancar o segundo fator de alguém atrás de uma permissão
  // significa que o administrador decide quem pode se proteger. E o inverso é
  // pior: quem perdeu todas as chaves continua precisando revogar o token que
  // deixou num servidor.
  //
  // A proteção destas rotas é de outra natureza, e está no maestro: são rotas de
  // credencial (`Origin` conferida, `no-store`, rate limit de escrita) e token de
  // API não as alcança (`exigirSessaoDeCookie`).
  'GET /api/auth/totp': null,
  'POST /api/auth/totp/enroll': null,
  'POST /api/auth/totp/confirm': null,
  'POST /api/auth/totp/disable': null,
  'GET /api/me/tokens': null,
  'POST /api/me/tokens': null,
  'POST /api/me/tokens/:id/revoke': null,

  // O QUE ESTÁ NO MEU NOME (F11, Etapa I). Dois baldes — posse direta e por posto
  // —, calculados para a PESSOA DA SESSÃO. Sem chave pelo mesmo motivo das de
  // cima: a rota irmã `/api/users/:id/holdings` exige `users.view` porque fala de
  // OUTRA pessoa; esta não tem `:id` para falar de ninguém mais.
  'GET /api/me/holdings': null,

  // `GET /api/access/directory` NÃO entra aqui: ela é PÚBLICA (`ROTAS_PUBLICAS`,
  // em server/app.ts), porque quem a lê é a tela de login — que roda sem sessão e
  // precisa saber se desenha o botão de entrada única. Declarar uma dispensa para
  // uma rota pública seria inofensivo e enganoso: dispensa pressupõe sessão.
};

const ROTAS: Record<string, ExigenciaDaRota> = {
  // ── ACESSO ────────────────────────────────────────────────────────────────
  'GET /api/groups': 'access.manage',
  'POST /api/groups': 'access.manage',
  'GET /api/groups/options': 'access.manage',
  'GET /api/groups/:id': 'access.manage',
  'PUT /api/groups/:id': 'access.manage',
  'DELETE /api/groups/:id': 'access.manage',
  'GET /api/users/:id/permissions': 'access.manage',
  'PUT /api/users/:id/groups': 'access.manage',

  // ── DIRETÓRIO E SSO (F11, Etapa I) ───────────────────────────────────────
  //
  // RODAR A SINCRONIZAÇÃO é `settings.manage`: ela mexe em `users` a partir de
  // uma fonte externa e é operação de sistema, não de cadastro — a mesma chave do
  // `POST /api/alerts/run`, que é o outro job que se dispara à mão.
  'POST /api/access/directory/sync': 'settings.manage',
  // MUDAR A ORIGEM DA IDENTIDADE é `access.manage`, e não `users.edit`: marcar uma
  // conta como federada CONCEDE um caminho de login — quem autenticar aquele
  // e-mail no provedor entra como a pessoa, com os grupos dela. É o mesmo
  // argumento que pôs `set-password` nesta chave.
  'PUT /api/users/:id/auth-source': 'access.manage',

  // As duas rotas do fluxo OIDC (`/api/auth/oidc/start` e `/callback`) NÃO entram
  // no mapa: elas são públicas (é por elas que a sessão nasce) e estão em
  // `ROTAS_PUBLICAS`, que o guard de permissão pula — e a conferência de cobertura
  // do boot também.

  'GET /api/agent-tokens': 'access.manage',
  'POST /api/agent-tokens': 'access.manage',
  'POST /api/agent-tokens/:id/revoke': 'access.manage',

  // ── ATIVOS ────────────────────────────────────────────────────────────────
  'GET /api/assets': 'assets.view',
  'GET /api/assets/:id': 'assets.view',
  'GET /api/assets/:id/history': 'assets.view',
  'GET /api/assets/by-serial/:serial': 'assets.view',
  'GET /api/assets/options': 'assets.view',
  'GET /api/assets/stats': 'assets.view',
  'GET /api/assets/fieldset': 'assets.view',
  'POST /api/assets/resolve-tags': 'assets.view',
  'GET /api/search': 'assets.view',
  'POST /api/assets': 'assets.create',
  'POST /api/assets/bulk': 'assets.create',
  'PUT /api/assets/:id': 'assets.edit',
  'DELETE /api/assets/:id': 'assets.delete',
  'POST /api/assets/:id/restore': 'assets.delete',
  'POST /api/assets/:id/retire': 'assets.delete',
  'POST /api/assets/:id/unretire': 'assets.delete',
  // O EXPORT é `reports.export`, e não `assets.view`: exportar é a porta dos
  // fundos do custo de compra (D77, obrigação cruzada). A coluna de custo ainda
  // depende de `assets.viewCost` lá dentro.
  'GET /api/assets/export': 'reports.export',

  // ── POSSE ─────────────────────────────────────────────────────────────────
  'GET /api/assets/:id/assignments': 'assets.view',
  'GET /api/assignments/overdue': 'assets.view',
  'GET /api/users/:id/holdings': 'users.view',
  'POST /api/assets/:id/checkout': 'assets.checkout',
  'POST /api/assets/:id/checkin': 'assets.checkout',
  'POST /api/assets/bulk-checkout': 'assets.checkout',

  // ── OCUPAÇÃO DE POSTO ─────────────────────────────────────────────────────
  // `assets.checkout` e não uma chave própria: ocupar posto É o que decide quem
  // responde pelo equipamento dele (D16). Quem pode entregar equipamento pode
  // dizer quem senta na mesa; separar as duas deixaria metade da posse de fora.
  'GET /api/locations/:id/occupants': 'assets.view',
  'POST /api/locations/:id/occupants': 'assets.checkout',
  // O caminho é aninhado (`/locations/:id/occupants/:occupantId`) e não
  // `/occupants/:id`: encerrar ocupação é operação SOBRE o posto, e o id do
  // local na URL é o que deixa a rota legível no log de acesso.
  'DELETE /api/locations/:id/occupants/:occupantId': 'assets.checkout',
  'GET /api/users/:id/occupancies': 'users.view',
  'GET /api/workstations': 'assets.view',
  'GET /api/workstations/:id': 'assets.view',

  // ── ANEXO E IMAGEM ────────────────────────────────────────────────────────
  'GET /api/assets/:id/attachments': 'assets.view',
  'GET /api/attachments/:id/download': 'assets.view',
  'POST /api/assets/:id/attachments': 'assets.edit',
  'DELETE /api/attachments/:id': 'assets.edit',
  'GET /api/images/:alvo/:id': 'assets.view',
  'PUT /api/images/:alvo/:id': 'assets.edit',
  'DELETE /api/images/:alvo/:id': 'assets.edit',

  // ── CONFERÊNCIA E MANUTENÇÃO ──────────────────────────────────────────────
  'GET /api/assets/:id/audits': 'assets.view',
  'POST /api/assets/:id/audit': 'assets.audit',
  'GET /api/locations/:id/auditoria': 'assets.view',
  'POST /api/locations/:id/auditoria': 'assets.audit',
  'GET /api/maintenances': 'assets.view',
  'GET /api/assets/:id/maintenances': 'assets.view',
  'POST /api/assets/:id/maintenances': 'assets.maintain',
  'PUT /api/maintenances/:id': 'assets.maintain',
  'DELETE /api/maintenances/:id': 'assets.maintain',
  'POST /api/maintenances/:id/close': 'assets.maintain',

  // ── TERMO DE ENTREGA ──────────────────────────────────────────────────────
  // As rotas `/api/aceite/*` NÃO entram no mapa: elas estão em
  // `ROTAS_PUBLICAS` (quem assina pode não ter conta — D27) e o guard de
  // permissão nem chega nelas.
  'GET /api/acceptances': 'assets.view',
  'GET /api/acceptances/:id/pdf': 'assets.view',
  'POST /api/acceptances/:id/remind': 'assets.checkout',

  // ── LICENÇAS ──────────────────────────────────────────────────────────────
  'GET /api/licenses': 'licenses.view',
  'GET /api/licenses/:id': 'licenses.view',
  'GET /api/licenses/:id/history': 'licenses.view',
  'GET /api/licenses/:id/seats': 'licenses.view',
  'GET /api/licenses/alerts': 'licenses.view',
  'GET /api/assets/:id/licenses': 'licenses.view',
  'POST /api/licenses': 'licenses.create',
  'PUT /api/licenses/:id': 'licenses.edit',
  'DELETE /api/licenses/:id': 'licenses.delete',
  'POST /api/licenses/:id/restore': 'licenses.delete',
  'POST /api/licenses/:id/checkout-seat': 'licenses.checkout',
  'POST /api/licenses/seats/:id/checkin': 'licenses.checkout',
  'GET /api/licenses/:id/product-key': 'licenses.viewKey',
  'GET /api/licenses/export': 'reports.export',

  // ── ESTOQUE ───────────────────────────────────────────────────────────────
  'GET /api/accessories': 'stock.view',
  'GET /api/accessories/:id': 'stock.view',
  'GET /api/accessories/:id/checkouts': 'stock.view',
  'GET /api/accessories/:id/movements': 'stock.view',
  'POST /api/accessories': 'stock.create',
  'PUT /api/accessories/:id': 'stock.edit',
  'POST /api/accessories/:id/adjust-quantity': 'stock.edit',
  'DELETE /api/accessories/:id': 'stock.delete',
  'POST /api/accessories/:id/restore': 'stock.delete',
  'POST /api/accessories/:id/checkout': 'stock.checkout',
  'POST /api/accessories/checkouts/:id/checkin': 'stock.checkout',

  'GET /api/consumables': 'stock.view',
  'GET /api/consumables/:id': 'stock.view',
  'GET /api/consumables/:id/movements': 'stock.view',
  'POST /api/consumables': 'stock.create',
  'PUT /api/consumables/:id': 'stock.edit',
  'POST /api/consumables/:id/adjust-quantity': 'stock.edit',
  'DELETE /api/consumables/:id': 'stock.delete',
  'POST /api/consumables/:id/restore': 'stock.delete',
  'POST /api/consumables/:id/consume': 'stock.checkout',

  'GET /api/components': 'stock.view',
  'GET /api/components/:id': 'stock.view',
  'GET /api/components/:id/movements': 'stock.view',
  'GET /api/assets/:id/components': 'stock.view',
  'POST /api/components': 'stock.create',
  'PUT /api/components/:id': 'stock.edit',
  'POST /api/components/:id/adjust-quantity': 'stock.edit',
  'DELETE /api/components/:id': 'stock.delete',
  'POST /api/components/:id/restore': 'stock.delete',
  // ATRELAR componente a ativo é `stock.checkout`, não `assets.edit`: o que sai
  // do saldo é a peça, e quem responde pelo número é o estoque.
  'POST /api/components/:id/attach': 'stock.checkout',
  'POST /api/components/attachments/:id/detach': 'stock.checkout',
  'GET /api/stock/alerts': 'stock.view',

  // ── PESSOAS ───────────────────────────────────────────────────────────────
  'GET /api/users': 'users.view',
  'GET /api/users/:id': 'users.view',
  'GET /api/users/:id/history': 'users.view',
  'GET /api/users/options': 'users.view',
  'POST /api/users': 'users.create',
  'PUT /api/users/:id': 'users.edit',
  'DELETE /api/users/:id': 'users.delete',
  'POST /api/users/:id/restore': 'users.delete',
  'POST /api/users/:id/offboard': 'users.offboard',
  // OS LIDERADOS (F11, Etapa E). `users.view` e não uma chave própria: é a
  // mesma listagem de pessoas, recortada por gestor.
  'GET /api/users/:id/reports': 'users.view',
  // DEFINIR A SENHA DE OUTRA PESSOA É `access.manage`, não `users.edit`.
  //
  // Quem troca a senha de alguém pode entrar como essa pessoa — e herdar os
  // grupos dela. É escalonamento de privilégio com outro nome: com `users.edit`
  // bastaria poder editar cadastro para alcançar o acesso de qualquer
  // administrador. A rota mora no `auth.maestro.ts` justamente porque o assunto
  // é credencial, não cadastro, e a chave segue o assunto.
  'POST /api/users/:id/set-password': 'access.manage',

  // ── MÁQUINAS, TELEMETRIA E CONVERGÊNCIA ───────────────────────────────────
  'GET /api/endpoints': 'endpoints.view',
  'GET /api/assets/:id/machine': 'endpoints.view',
  'GET /api/reconciliation/coverage': 'endpoints.view',
  'GET /api/reconciliation/idle': 'endpoints.view',
  'GET /api/reconciliation/suggestions': 'endpoints.view',
  // ACEITAR E RECUSAR exigem a MESMA chave, e a escolhida é a da posse.
  //
  // Aceitar não "edita endpoint": o use-case chama `checkoutAsset` e
  // `addLocationOccupant` (F4) — ele CRIA posse e ocupação de posto. Então a
  // chave é a de quem pode entregar equipamento.
  //
  // Recusar muda só o estado da sugestão e caberia numa chave mais fraca. Entra
  // na mesma de propósito: triar a fila é UMA operação com duas respostas, e
  // quem pudesse dizer "não" sem poder dizer "sim" esvaziaria a fila do jeito
  // mais fácil. A assimetria convidaria ao pior uso.
  'POST /api/reconciliation/suggestions/:id/accept': 'assets.checkout',
  'POST /api/reconciliation/suggestions/:id/reject': 'assets.checkout',
  'GET /api/software-packages': 'endpoints.view',
  'GET /api/licenses/:id/compliance': 'licenses.view',
  'GET /api/licenses/:id/software': 'licenses.view',
  'PUT /api/licenses/:id/software': 'licenses.edit',
  // VINCULAR máquina a ativo muda de quem é a máquina no inventário: é edição
  // de ativo, não visualização de endpoint.
  'POST /api/endpoints/:id/link': 'assets.edit',
  'DELETE /api/endpoints/:id/link': 'assets.edit',
  'POST /api/endpoints/:id/merge': 'assets.edit',
  'PATCH /api/endpoints/:id/review': 'assets.edit',
  // A AÇÃO MAIS PERIGOSA DO SISTEMA, com chave própria e só dela.
  'POST /api/endpoints/:hwid/command': 'endpoints.command',

  // ── RELATÓRIOS ────────────────────────────────────────────────────────────
  'GET /api/reports/prazos': 'reports.view',
  'GET /api/reports/auditorias': 'reports.view',
  'GET /api/reports/manutencoes': 'reports.view',
  'GET /api/reports/responsabilidade': 'reports.view',
  // DEPRECIAÇÃO exige a chave do CUSTO, na rota inteira (D138): o relatório
  // devolve custo total, custo depreciável e valor contábil por linha. Sem
  // custo não sobra relatório, e um 200 com todos os números nulos é pior do
  // que um 403 — parece frota sem valor cadastrado.
  'GET /api/reports/depreciacao': 'assets.viewCost',
  'GET /api/reports/builder/fields': 'reports.export',
  'POST /api/reports/custom': 'reports.export',

  // ── CATÁLOGO ──────────────────────────────────────────────────────────────
  // As 45 rotas das nove specs são declaradas em laço, logo abaixo.

  // ── CAMPOS CUSTOMIZADOS ───────────────────────────────────────────────────
  'GET /api/custom-fieldsets/:id/fields': 'assets.view',
  'PUT /api/custom-fieldsets/:id/fields': 'catalog.manage',
  'GET /api/custom-fields/list-view': 'assets.view',
  // REVELAR O CAMPO CIFRADO (F9). Chave própria, e é a contraparte do
  // mascaramento: o valor chega na tela como `••••` em toda leitura, e esta é
  // a única rota que o decifra — com `ActivityLog` do ato, porque "quem viu a
  // senha da BIOS daquele notebook?" é pergunta que se faz depois do incidente.
  'GET /api/assets/:id/custom-fields/:slug/reveal': 'assets.viewSecret',

  // ── CONFIGURAÇÃO ──────────────────────────────────────────────────────────
  // A LEITURA é dispensada de chave própria e exige `assets.view`: o formulário
  // de ativo lê `next-asset-tag` e o branding entra no PDF do termo. Trancar a
  // leitura por `settings.manage` tornaria o cadastro de ativo privilégio de
  // administrador.
  'GET /api/settings': 'assets.view',
  'GET /api/settings/next-asset-tag': 'assets.create',
  'GET /api/settings/branding/:marca': 'assets.view',
  'GET /api/settings/alerts': 'reports.view',
  'GET /api/settings/discovery': 'endpoints.view',
  'PUT /api/settings': 'settings.manage',
  'PUT /api/settings/alerts': 'settings.manage',
  'PUT /api/settings/branding/:marca': 'settings.manage',
  'DELETE /api/settings/branding/:marca': 'settings.manage',
  'PUT /api/settings/discovery': 'settings.manage',

  // ── ALERTAS ───────────────────────────────────────────────────────────────
  'GET /api/alerts': 'reports.view',
  'POST /api/alerts/:id/read': 'reports.view',
  'POST /api/alerts/read-all': 'reports.view',
  // RODAR o job à mão é operação de sistema, não leitura de alerta.
  'POST /api/alerts/run': 'settings.manage',

  // ── ETIQUETAS ─────────────────────────────────────────────────────────────
  'GET /api/labels/layout': 'labels.print',
  'POST /api/labels/preview': 'labels.print',
  'POST /api/labels/sheet': 'labels.print',
  'PUT /api/labels/layout': 'settings.manage',

  // ── IMPORTAÇÃO ────────────────────────────────────────────────────────────
  'GET /api/imports': 'imports.manage',
  'GET /api/imports/:id': 'imports.manage',
  'GET /api/imports/:id/rows': 'imports.manage',
  'GET /api/imports/fields': 'imports.manage',
  'GET /api/imports/template': 'imports.manage',
  'POST /api/imports': 'imports.manage',
  'POST /api/imports/:id/apply': 'imports.manage',

  // ── BACKUP ────────────────────────────────────────────────────────────────
  //
  // ESTAS QUATRO SÓ EXISTEM COM `BACKUP_ENABLED` LIGADO (F10, Etapa A): o
  // maestro não as registra quando a variável está desligada, que é o padrão.
  // Declaradas aqui de qualquer forma — a declaração não custa nada e, no dia em
  // que alguém ligar a variável em produção, as rotas nascem protegidas em vez de
  // derrubar o boot. Ver `ROTAS_CONDICIONAIS` no teste de invariante.
  'GET /api/backups': 'backup.download',
  'POST /api/backups': 'backup.download',
  'POST /api/backups/prune': 'backup.download',
  'GET /api/backups/:nome/download': 'backup.download',

  ...DISPENSADAS,
};

// AS ROTAS DE CATÁLOGO, declaradas no MESMO laço que as registra (D137).
//
// As cinco rotas por spec nascem de `CATALOG_SPECS` (catalog.maestro.ts), e a
// declaração de permissão nasce da mesma lista — então a spec nova traz a
// própria permissão e o boot continua fechando. Escritas à mão, a décima spec
// entraria com cinco rotas que ninguém declarou e o boot cairia por um
// esquecimento que não é esquecimento.
//
// LEITURA exige `assets.view`, e não `catalog.view`: todo formulário do sistema
// lê `/options` para montar um `<select>`. Uma chave própria de leitura de
// catálogo seria uma chave que todo mundo precisa ter — ou seja, nenhuma.
for (const spec of CATALOG_SPECS) {
  const base = `/api/${spec.slug}`;
  ROTAS[`GET ${base}`] = 'assets.view';
  ROTAS[`GET ${base}/options`] = 'assets.view';
  ROTAS[`POST ${base}`] = 'catalog.manage';
  ROTAS[`PUT ${base}/:id`] = 'catalog.manage';
  ROTAS[`DELETE ${base}/:id`] = 'catalog.manage';
}

export const ROTAS_POR_PERMISSAO: Readonly<Record<string, ExigenciaDaRota>> = ROTAS;

/** A chave do mapa, num lugar só — o guard e o teste usam a MESMA montagem. */
export function chaveDaRota(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}

/**
 * O que esta rota exige.
 *
 * Três respostas, e a diferença entre as duas últimas é o ponto do D137:
 *   `Permissao`   exige a chave;
 *   `null`        dispensa DECLARADA — sessão basta;
 *   `undefined`   **não declarada** — o boot não sobe.
 */
export function exigenciaDaRota(method: string, url: string): ExigenciaDaRota | undefined {
  const chave = chaveDaRota(method, url);
  return Object.hasOwn(ROTAS, chave) ? ROTAS[chave] : undefined;
}

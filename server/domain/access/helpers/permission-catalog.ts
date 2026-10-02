// O CATÁLOGO DE CHAVES — a allowlist do que uma permissão pode ser.
//
// Declarado em CÓDIGO, e não deduzido do que está gravado nos grupos, por causa
// do risco que o D76 nomeia: `permissions` é JsonB, e chave digitada errada ali
// não dá erro nenhum — ela só **nega em silêncio**. `assets.viw` gravado num
// grupo não falha em lugar nenhum; a pessoa simplesmente não consegue ver
// ativo, e a investigação começa procurando bug no `preHandler`.
//
// Com o catálogo aqui, há onde conferir: a tela de grupos oferece só estas, a
// gravação recusa o que não está nesta lista, e `tests/invariantes/permissao.test.ts`
// confere as duas pontas — toda chave usada numa rota existe aqui, e toda chave
// gravada em `groups.permissions` existe aqui.
//
// ─────────────────────────────────────────────────────────────────────────────
// A FORMA É `<módulo>.<ação>`, e a granularidade é a que o TODO pediu:
// view / create / edit / delete / checkout por tipo de item. Mais fina do que
// isso vira tela de permissão que ninguém configura; mais grossa deixa
// "pode devolver equipamento" e "pode apagar o cadastro" na mesma chave.
//
// AS TRÊS CHAVES QUE NÃO SÃO CRUD, e cada uma existe por um motivo próprio:
//
//   `*.viewCost` / `*.viewKey`  dado sensível DENTRO de um registro que a pessoa
//                               pode ver. Quem vê o ativo não necessariamente
//                               vê quanto ele custou (D77, D138).
//   `endpoints.command`         executar comando na máquina do outro é a ação
//                               mais perigosa do sistema, e não é "editar
//                               endpoint": é mexer no computador de alguém.
//   `access.manage`             conceder permissão. Separada de tudo porque
//                               quem a tem pode se dar o resto.
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSION_CATALOG = {
  // ── ACESSO ────────────────────────────────────────────────────────────────
  'access.manage': 'Gerenciar grupos, permissões e tokens de API',

  // ── ATIVOS ────────────────────────────────────────────────────────────────
  'assets.view': 'Ver ativos',
  'assets.create': 'Cadastrar ativos',
  'assets.edit': 'Editar ativos',
  'assets.delete': 'Excluir e descomissionar ativos',
  'assets.checkout': 'Entregar e devolver ativos, e ocupar postos',
  'assets.viewCost': 'Ver custo de compra e valor contábil',
  // O SEGREDO EM CAMPO CUSTOMIZADO (F9) tem chave PRÓPRIA, separada do custo.
  //
  // São dados sensíveis de naturezas diferentes: custo é número que o
  // financeiro vê, e campo cifrado é senha de BIOS, chave de cofre, PIN de
  // chip — o cliente escolheu o que guardar ali. Quem precisa do inventário
  // valorizado não precisa das senhas, e vice-versa.
  //
  // E o CAMINHO é diferente: custo some do `select` (D77), enquanto o campo
  // cifrado chega SEMPRE mascarado e é revelado por rota própria
  // (`/custom-fields/:slug/reveal`) — porque em JsonB não existe select
  // parcial, e mascarar depois é o limite do D77, não exceção a ele (D140).
  'assets.viewSecret': 'Revelar campo customizado cifrado',
  'assets.audit': 'Registrar conferência física',
  'assets.maintain': 'Registrar manutenção',

  // ── LICENÇAS ──────────────────────────────────────────────────────────────
  'licenses.view': 'Ver licenças',
  'licenses.create': 'Cadastrar licenças',
  'licenses.edit': 'Editar licenças',
  'licenses.delete': 'Excluir licenças',
  'licenses.checkout': 'Atribuir e liberar assentos',
  'licenses.viewKey': 'Revelar chave de produto',

  // ── ESTOQUE ───────────────────────────────────────────────────────────────
  'stock.view': 'Ver acessórios, consumíveis e componentes',
  'stock.create': 'Cadastrar itens de estoque',
  'stock.edit': 'Editar itens de estoque e ajustar saldo',
  'stock.delete': 'Excluir itens de estoque',
  'stock.checkout': 'Entregar, devolver e consumir itens de estoque',

  // ── PESSOAS ───────────────────────────────────────────────────────────────
  'users.view': 'Ver colaboradores',
  'users.create': 'Cadastrar colaboradores',
  'users.edit': 'Editar colaboradores',
  'users.delete': 'Excluir colaboradores',
  'users.offboard': 'Desligar colaboradores',

  // ── MÁQUINAS (RMM) ────────────────────────────────────────────────────────
  'endpoints.view': 'Ver máquinas, telemetria e convergência',
  'endpoints.command': 'Executar comando remoto na máquina',

  // ── CATÁLOGO ──────────────────────────────────────────────────────────────
  'catalog.manage': 'Editar os cadastros de apoio (categorias, modelos, locais…)',

  // ── RELATÓRIOS ────────────────────────────────────────────────────────────
  'reports.view': 'Ver relatórios',
  'reports.export': 'Exportar CSV e montar relatório',

  // ── OPERAÇÃO DO SISTEMA ───────────────────────────────────────────────────
  'settings.manage': 'Alterar configurações do sistema',
  'labels.print': 'Gerar etiquetas',
  'imports.manage': 'Importar planilhas',
  'backup.download': 'Gerar e baixar backup do banco',
} as const;

/** Toda chave que existe. É o tipo que o `requirePermission` aceita. */
export type Permissao = keyof typeof PERMISSION_CATALOG;

export const TODAS_AS_PERMISSOES = Object.keys(PERMISSION_CATALOG) as Permissao[];

/**
 * A chave está no catálogo?
 *
 * `Object.hasOwn` e NÃO `chave in PERMISSION_CATALOG`: `'constructor' in obj` é
 * `true` em qualquer objeto, e por aí uma permissão chamada `constructor`
 * gravada num grupo passaria pela validação. É o mesmo furo que a revisão da
 * F10 fechou em quatro allowlists de token do report builder.
 */
export function ehPermissaoConhecida(chave: string): chave is Permissao {
  return Object.hasOwn(PERMISSION_CATALOG, chave);
}

/**
 * O NOME do grupo de sistema, num lugar só.
 *
 * Ele era uma constante dentro de `prisma/seed.ts` e outra string literal na
 * migração — e tem TRÊS leitores que precisam concordar para sempre: o seed (que
 * reconcilia as permissões dele), a rota de edição (que recusa alterá-las) e o
 * comando de linha de escape (`access/cli/conceder-administrador.cli.ts`). Dois
 * literais iguais em arquivos diferentes é uma renomeação a um `grep` de distância
 * de trancar o sistema.
 */
export const GRUPO_ADMINISTRADOR = 'Administrador';

/**
 * O grupo que pode tudo — o seed do `Administrador`, e o alvo do 409 do
 * "nunca sem administrador".
 *
 * Derivado do catálogo em vez de escrito à mão: chave nova no catálogo entra no
 * administrador sozinha. Uma lista paralela ficaria velha na primeira chave
 * acrescentada, e o sintoma seria o administrador perdendo acesso a uma tela
 * nova sem ninguém entender por quê.
 */
export function permissoesDeAdministrador(): Record<Permissao, true> {
  return Object.fromEntries(TODAS_AS_PERMISSOES.map((chave) => [chave, true])) as Record<Permissao, true>;
}

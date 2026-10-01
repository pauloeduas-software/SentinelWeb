import { $Enums, Prisma } from '@prisma/client';

// O QUE É "ESTAR NO PARQUE" — uma definição, no domínio dono das colunas.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ELA MORA AQUI E NÃO EM CADA DOMÍNIO QUE PERGUNTA.
//
// Nasceu na F8 dentro de `report/helpers/report-scope.helper.ts`, e a auditoria
// escreveu a própria versão — mais frouxa, só `retiredAt: null`. O resultado era
// um ativo ARCHIVED que entrava na conferência de posto, era auditado, tinha
// `lastAuditAt` avançado pelo agente todo dia e NUNCA aparecia em relatório de
// auditoria nem gerava alerta: conferi-lo era trabalho que o relatório não via.
//
// Duas respostas para a mesma pergunta é o D16 numa constante. A pergunta é do
// ATIVO — são as colunas dele —, então a resposta mora no domínio dele, e
// `report`, `audit` e `alert` importam.
//
// SÃO TRÊS COLUNAS COM TRÊS SIGNIFICADOS (D19), e as três importam:
//
//   `deletedAt`            cadastrado errado, está na lixeira → sai pela extension
//   `retiredAt`            saiu do PATRIMÔNIO: vendido, descartado, roubado
//   `status.type ARCHIVED` saiu da OPERAÇÃO, reversível trocando o status
//
// Um notebook vendido em março com garantia vencendo em abril produziria um aviso
// que ninguém pode agir sobre — e a central de alertas perde autoridade na
// primeira semana em que cobra coisa impossível. O precedente é do painel de
// cobertura da F7: `const vivos = { retiredAt: null }`, com a nota "ativo vendido
// não é fantasma"; o `ARCHIVED` entrou junto porque a listagem padrão de ativos
// já o exclui (`whereDaVista`, em asset-filters.helper.ts).
//
// `deletedAt` NÃO está escrito aqui de propósito: em consulta à raiz de `assets`
// a `softDeleteExtension` o aplica sozinha. Quem alcança o ativo por RELAÇÃO
// aninhada (`asset: { … }`) precisa somar `deletedAt: null` à mão, porque relação
// aninhada não herda escopo (D8, verificado) — é o que `SOBRE_ATIVO_VIVO` faz na
// manutenção.
// ═════════════════════════════════════════════════════════════════════════════

export const ATIVO_NO_PARQUE: Prisma.AssetWhereInput = {
  retiredAt: null,
  status: { type: { not: $Enums.StatusLabelType.ARCHIVED } },
};

/**
 * A MESMA definição em SQL, para quem lê por `$queryRaw` (F10, Etapa F).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUE A VERSÃO SQL MORA NESTE ARQUIVO, E NÃO NO RELATÓRIO QUE A USA.
 *
 * A revisão da F8 encontrou TRÊS versões de "estar no parque" espalhadas, e a
 * mais frouxa tinha consequência: um ativo `ARCHIVED` era auditado todo dia pelo
 * job e nunca aparecia no relatório. A correção foi trazer a definição para o
 * domínio dono das colunas — este arquivo.
 *
 * A F10 trouxe um segundo leitor, de outra natureza: os relatórios que agrupam
 * por responsável resolvido descem para `$queryRaw` (a view `vw_asset_responsibles`
 * não existe no Prisma, e agrupar em memória não é possível — ver D66). Escrever
 * `a."retiredAt" IS NULL AND s.type <> 'ARCHIVED'` dentro do relatório criaria a
 * QUARTA cópia, e seria a primeira em outra linguagem, onde o compilador não
 * alcança.
 *
 * `Prisma.sql` e não string: o fragmento é interpolado em `$queryRaw` com
 * `Prisma.join`/template, e o tipo é o que impede alguém concatenar entrada de
 * cliente no meio dele.
 *
 * ⚠️ ELE PRESSUPÕE OS APELIDOS `a` (assets) E `s` (status_labels). Quem usar
 * precisa declarar os dois no `FROM`/`JOIN` — está escrito assim porque um
 * fragmento com nome de tabela completo não poderia participar de um join com
 * apelido, que é como todos os relatórios desta fase são escritos.
 */
export const ATIVO_NO_PARQUE_SQL = Prisma.sql`a."retiredAt" IS NULL AND s.type <> 'ARCHIVED'`;

/** O escopo da lixeira em SQL — `$queryRaw` NÃO passa pela extension (D8). */
export const ATIVO_VIVO_SQL = Prisma.sql`a."deletedAt" IS NULL`;

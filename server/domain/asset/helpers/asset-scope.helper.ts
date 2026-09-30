import type { Prisma } from '@prisma/client';
import { $Enums } from '@prisma/client';

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

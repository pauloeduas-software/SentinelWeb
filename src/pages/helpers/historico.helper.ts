// A LEITURA DE UM EVENTO DE HISTÓRICO — funções puras, compartilhadas pelas
// abas Histórico do ativo e da pessoa.
//
// Nasceu dentro de `ativos/detalhe/helpers/`, quando o ativo era o único
// com linha do tempo, e mudou para cá quando a pessoa ganhou a dela (Leva 1C do
// fechamento da F4, em docs/historico/fase-04-posse.md). O que ficou lá é o que É do ativo — a
// frase do título; o que veio para cá é o que vale para qualquer trilha.
//
// As trilhas são só movimentação (entregas, devoluções, postos, licenças). O
// diff de cadastro e edição fica na auditoria, no banco (AB), e não chega à tela.

/**
 * As ações que QUALQUER trilha tem: a entrega e a devolução.
 *
 * O que é de uma fonte só (entrar no posto, receber a licença) não entra aqui:
 * entra no mapa que a tela passa a `rotuloDaAcao`.
 */
const ROTULO_DA_ACAO: Record<string, string> = {
  CHECKOUT: 'Entregue',
  CHECKIN: 'Devolvido',
};

/**
 * O que a ação quer dizer, em português.
 *
 * Ação desconhecida aparece como ela é, em vez de virar "Outro": uma operação
 * nova do servidor que os mapas ainda não conheçam continua legível — e o nome
 * cru é o sinal de que falta uma linha em algum deles.
 */
export function rotuloDaAcao(action: string, extras: Record<string, string> = {}): string {
  return extras[action] ?? ROTULO_DA_ACAO[action] ?? action;
}

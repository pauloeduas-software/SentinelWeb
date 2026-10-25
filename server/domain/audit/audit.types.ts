// QUEM FEZ — o autor de uma linha da auditoria (AB).
//
// A diferença entre as formas é o que a auditoria existe para provar: uma CONTA
// do painel fez, ou o SISTEMA fez sozinho. A conta vem da sessão
// (`auth/helpers/actor.helper.ts`), nunca do corpo da requisição; o sistema se
// identifica pela origem ('job:reconciliacao', 'cli:conceder-administrador').
//
// A terceira, SEM SESSÃO, é a tela de login: a senha errada e a conta
// bloqueada acontecem NUMA conta, mas quem digitou não provou ser ela. Gravar
// como a conta acusaria a dona dela de uma tentativa que pode ser de outro.
// Fica o número da requisição, que leva à linha do log.
//
// Nome e e-mail vão POR ESCRITO, como estavam no momento da ação: a conta pode
// mudar de nome ou ser excluída depois, e a linha continua dizendo quem fez.
export type Ator =
  | { tipo: 'USER'; id: string; nome: string; email: string; requestId: string }
  | { tipo: 'SYSTEM'; origem: string }
  | { tipo: 'ANONYMOUS'; requestId: string };

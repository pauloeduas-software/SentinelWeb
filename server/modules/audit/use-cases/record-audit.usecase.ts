import type { Prisma } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import { createLogger } from '../../../infra/logger/logger';
import type { Ator } from '../audit.types';

const logger = createLogger('auditoria');

// A AUDITORIA — quem fez o quê, em qual registro, e quando (AB).
//
// O AUTOR fica só no banco: tela nenhuma o mostra. É o administrador quem o
// consulta, para responder se um erro foi do sistema ou de uma conta. A X tinha
// tirado o autor; a AB o traz de volta, por escrito.
//
// O AUTOR É O TERCEIRO PARÂMETRO, e obrigatório (D23, de volta pela AB). Fora
// do `input` porque ele não descreve a OPERAÇÃO: o que mudou é dado do evento,
// quem estava logado é contexto da requisição. E sem default: chamada nova que
// esqueça o autor não compila, em vez de gravar uma linha sem dono que só seria
// descoberta no dia em que alguém precisasse dela.

// `END` é o encerramento de um vínculo que tem começo e fim — a ocupação de um
// posto de trabalho (`WorkstationOccupant`). Não é `DELETE`: a linha continua na
// tabela, só ganha `endedAt`. Ter as duas palavras é o que deixa o histórico
// distinguir "a Laura saiu da Mesa 1" de "o vínculo foi cadastrado errado e
// removido" — dois eventos diferentes que um `DELETE` para ambos apagaria.
// `CHECKOUT` e `CHECKIN` são a ENTREGA e a DEVOLUÇÃO de um ativo
// (`Assignment`). Separadas de `UPDATE` porque não são uma edição de campo:
// são as duas únicas operações que escrevem posse, e quem audita quer lê-las
// como evento, não como diff (docs/referencia/modelo-de-posse.md).
// `LINK` e `UNLINK` são o vínculo endpoint↔ativo da convergência com o RMM
// (F7, D45). Gravadas com `entityType: 'Asset'` — quem consulta a auditoria do
// ativo quer ler "passou a ser a máquina PC-ANA" no mesmo registro, e não
// numa entidade à parte.
//
// Elas existem separadas de `UPDATE` porque não são edição de campo: são a
// afirmação de que este patrimônio e aquela máquina descoberta são a mesma
// coisa — e ela é desfeita SOZINHA pelo `onDelete: SetNull` quando um ativo é
// apagado de verdade, o que torna a linha de log a única testemunha do que
// havia antes.
//
// `LOGIN`, `LOGOUT` e `LOGIN_FAILED` são a entrada e a saída de uma conta; a
// falha leva o motivo ('senha', 'bloqueada', 'desativada'). `COMMAND` é a ordem
// mandada à máquina (desligar, reiniciar). `RUN` é a reconciliação pedida pela
// tela, e `REJECT` a sugestão de vínculo recusada.
//
// A UNIÃO LISTA O QUE O SISTEMA GRAVA, e nada além. A coluna é `String` no
// banco, então encurtá-la não pede migração — e as linhas antigas de ações que
// não existem mais continuam legíveis, com o valor cru no lugar do rótulo.
type AuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'END'
  | 'CHECKOUT' | 'CHECKIN' | 'RETIRE' | 'UNRETIRE'
  | 'LINK' | 'UNLINK'
  | 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED'
  | 'COMMAND' | 'RUN' | 'REJECT';

interface RecordAuditInput {
  entityType: string;
  /**
   * Nulo só no que não é UM registro: a configuração da descoberta (uma linha
   * única, sem uuid) e a rodada de reconciliação.
   */
  entityId: string | null;
  /**
   * O registro POR ESCRITO — a etiqueta do ativo, o nome do item, do posto. É
   * por ele que o administrador procura, e é o que sobra quando o registro é
   * excluído de verdade: o `entityId` de algo apagado não leva a nada.
   */
  entityLabel: string;
  action: AuditAction;
  /**
   * O que mudou: o retrato no cadastro e na exclusão, `{ de, para }` na
   * edição. NUNCA credencial: `passwordHash` e token não entram aqui nem
   * mascarados — a auditoria guarda para sempre.
   */
  changes?: Prisma.InputJsonValue | null;
}

/**
 * Aceita o cliente da transação para o log e a operação caírem JUNTOS: gravado
 * fora da transação, a auditoria registraria uma edição que depois falhou.
 */
type ClienteComAuditLog = Pick<typeof prisma, 'auditLog'>;

export async function recordAudit(
  client: ClienteComAuditLog,
  input: RecordAuditInput,
  ator: Ator,
): Promise<void> {
  await client.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel,
      action: input.action,
      changes: input.changes ?? undefined,
      ...colunasDoAutor(ator),
    },
  });
}

/**
 * A linha de algo que JÁ ACONTECEU fora do banco e não volta atrás: o comando
 * que saiu para a máquina, a rodada que terminou, a sessão que está saindo.
 *
 * Não há transação para desfazer junto, então a falha da gravação não pode
 * virar a resposta: o 500 diria que o comando não saiu, e o clique de novo
 * mandaria o segundo desligamento. A linha que não entrou vai inteira para o
 * log — quem, o quê, a requisição —, e a resposta diz o que aconteceu.
 */
export async function recordAuditDoQueJaAconteceu(input: RecordAuditInput, ator: Ator): Promise<void> {
  try {
    await recordAudit(prisma, input, ator);
  } catch (erro) {
    logger.error('[Auditoria] A linha não entrou no banco; fica no log no lugar dela:', { ...input, ator }, erro);
  }
}

/**
 * A conta entra inteira; o sistema, só pela origem; o login sem sessão, só pela
 * requisição (CHECK `audit_logs_autor_coerente`).
 */
function colunasDoAutor(ator: Ator) {
  if (ator.tipo === 'USER') {
    return {
      actorType: 'USER' as const,
      actorId: ator.id,
      actorName: ator.nome,
      actorEmail: ator.email,
      source: 'painel',
      requestId: ator.requestId,
    };
  }
  if (ator.tipo === 'ANONYMOUS') {
    return { actorType: 'ANONYMOUS' as const, source: 'painel', requestId: ator.requestId };
  }
  return { actorType: 'SYSTEM' as const, source: ator.origem };
}

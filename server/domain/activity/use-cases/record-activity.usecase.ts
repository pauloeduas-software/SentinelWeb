import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';

// Trilha de auditoria — o *Activity Report* do Snipe-IT.
//
// O ATOR É O TERCEIRO PARÂMETRO, e não um campo de `input`, desde a F3 (D23).
// Fora do payload porque ele não descreve a OPERAÇÃO: quem mudou o quê é dado
// do evento, quem estava logado é contexto da requisição. Separado, ele fica
// visível em cada chamada — `recordActivity(tx, {...}, actorId)` denuncia o
// esquecimento já na leitura.
//
// E ELE É OBRIGATÓRIO: o `= null` temporário que a F3 deixou aqui foi apagado
// quando `catalog` (3 chamadas) e `occupancy` (2) passaram a propagar o ator
// (Leva 1A do fechamento da F3, em docs/historico/fase-03-autenticacao-e-ator.md). É a AUSÊNCIA de
// default que
// fecha a rede do D23: chamada nova que esqueça o ator não compila, em vez de
// gravar `null` e só ser descoberta numa auditoria — a mesma rede do rename do
// `Asset` no D13, onde os 6 pontos do RMM falharam na compilação e nenhum
// passou em silêncio.
//
// O que ficou para trás continua sem ator DE PROPÓSITO: não há backfill (D24).
// Auditoria falsificada é pior que auditoria ausente, porque parece confiável.

// `END` é o encerramento de um vínculo que tem começo e fim — a ocupação de um
// posto de trabalho (`LocationOccupant`). Não é `DELETE`: a linha continua na
// tabela, só ganha `endedAt`. Ter as duas palavras é o que deixa o histórico
// distinguir "a Laura saiu da Mesa 1" de "o vínculo foi cadastrado errado e
// removido" — dois eventos diferentes que um `DELETE` para ambos apagaria.
// `CHECKOUT` e `CHECKIN` são a ENTREGA e a DEVOLUÇÃO de um ativo
// (`Assignment`). Separadas de `UPDATE` porque não são uma edição de campo:
// são as duas únicas operações que escrevem posse, e o
// histórico do ativo precisa mostrá-las como evento, não como diff
// (docs/referencia/modelo-de-posse.md).
// `LINK` e `UNLINK` são o vínculo endpoint↔ativo da convergência com o RMM
// (F7, D45). Gravadas com `entityType: 'Asset'` — quem abre o histórico do
// ativo quer ler "passou a ser a máquina PC-ANA", e um log pendurado numa
// entidade que a tela não abre não apareceria em consulta nenhuma.
//
// Elas existem separadas de `UPDATE` porque não são edição de campo: são a
// afirmação de que este patrimônio e aquela máquina descoberta são a mesma
// coisa — e ela é desfeita SOZINHA pelo `onDelete: SetNull` quando um ativo é
// apagado de verdade, o que torna a linha de log a única testemunha do que
// havia antes.
//
// A UNIÃO LISTA O QUE O SISTEMA GRAVA, e nada além. A coluna é `String` no
// banco, então encurtá-la não pede migração — e as linhas antigas de ações que
// não existem mais continuam legíveis, com o valor cru no lugar do rótulo.
type ActivityAction =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'END'
  | 'CHECKOUT' | 'CHECKIN' | 'RETIRE' | 'UNRETIRE'
  | 'LINK' | 'UNLINK';

interface RecordActivityInput {
  entityType: string;
  entityId: string;
  action: ActivityAction;
  /**
   * O diff do que mudou. NUNCA credencial: `passwordHash` e token não entram
   * aqui nem mascarados — um `ActivityLog` é lido por mais gente do que o banco
   * e guarda para sempre.
   */
  changes?: Prisma.InputJsonValue | null;
}

/**
 * Aceita o cliente da transação para o log e a operação caírem JUNTOS: gravado
 * fora da transação, o histórico registraria uma edição que depois falhou.
 */
type ClienteComActivityLog = Pick<typeof prisma, 'activityLog'>;

export async function recordActivity(
  client: ClienteComActivityLog,
  input: RecordActivityInput,
  /**
   * Quem fez. Sai de `request.user.id` (auth/helpers/actor.helper.ts) e desce
   * pelos parâmetros — NADA de `AsyncLocalStorage`, que é menos digitação e
   * falha em silêncio: um caminho que não propague o contexto (um job, o hub do
   * agente) gravaria `null` e ninguém descobriria até auditar (D23).
   *
   * `null` EXPLÍCITO onde não há requisição: seed e job não têm ator, e essa é
   * a resposta certa — não um usuário `system` inventado para preencher coluna.
   * Escrito à mão, esse `null` é uma afirmação; por omissão, era um silêncio.
   */
  actorId: string | null,
): Promise<void> {
  await client.activityLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      changes: input.changes ?? undefined,
      actorId,
    },
  });
}

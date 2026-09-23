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
// (Leva 1 do docs/FECHAMENTO-F2-F4-PLANO-ITAM.md). É a AUSÊNCIA de default que
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
// são as duas únicas operações que escrevem `Asset.assignedToId`, e o
// histórico do ativo precisa mostrá-las como evento, não como diff
// (docs/MODELO-POSSE.md).
// `ATTACH` e `DETACH` são anexo POSTO e RETIRADO de um ativo. Gravados com
// `entityType: 'Asset'`, e não numa entidade `Attachment` própria: quem lê a
// aba Histórico quer saber que a nota fiscal daquele notebook foi trocada, e um
// log pendurado no anexo apagado não apareceria em consulta nenhuma — a linha
// dele some no `DELETE` físico, o histórico do ativo não.
// `INSTALL` e `UNINSTALL` são COMPONENTE posto e retirado de dentro de um
// ativo (F5) — peça, não arquivo. Palavras próprias, e não os `ATTACH`/
// `DETACH` acima, porque os dois eventos apareceriam na MESMA aba Histórico do
// mesmo ativo: "anexo posto" para a nota fiscal e para o pente de RAM é uma
// linha do tempo em que ninguém distingue documento de hardware. São gravados
// DUAS vezes, em duas entidades — no componente ("para onde foram as
// unidades") e no ativo ("o que tem dentro dele") —, e nenhuma é cópia da
// outra: são as duas perguntas que a operação responde.
export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'END' | 'CHECKOUT' | 'CHECKIN' | 'RETIRE' | 'UNRETIRE' | 'OFFBOARD' | 'ATTACH' | 'DETACH' | 'ACCEPT' | 'DECLINE' | 'REVOKE' | 'INSTALL' | 'UNINSTALL' | 'ADJUST';

// `ADJUST` é a quantidade NOMINAL de um item de estoque mudando — chegou nota,
// quebrou, recontagem (F5, Etapa D). Ele convive com o `StockLog`, que grava o
// mesmo ajuste com `delta` e `reason` tipados: o log responde a pergunta de
// ESTOQUE ("quanto entrou e por quê") e esta linha põe o evento na trilha de
// auditoria geral, ao lado das edições do item. Não é duplicação de fonte —
// é a mesma escolha do CHECKOUT, que está no ActivityLog e em `assignments`.

// `ACCEPT` e `DECLINE` são o termo de entrega respondido. Gravados com
// `entityType: 'Asset'` como o checkout, e com o SIGNATÁRIO no `actorId` — é o
// único ponto do sistema em que o ator não sai de `request.user`, porque a
// rota `/aceite/:token` é pública e quem age é quem tem o token.

export interface RecordActivityInput {
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

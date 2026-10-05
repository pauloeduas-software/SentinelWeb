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
// são as duas únicas operações que escrevem `Asset.assignedToId`, e o
// histórico do ativo precisa mostrá-las como evento, não como diff
// (docs/referencia/modelo-de-posse.md).
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
// `VIEW_KEY` é a chave de produto de uma licença REVELADA (F6). Ela é a
// primeira ação do projeto que registra uma LEITURA — todas as outras registram
// escrita —, e isso é de propósito, não o começo de um padrão: a chave é o
// único dado do sistema cujo simples acesso é o fato auditável, porque depois
// de revelada ela não pode ser "des-revelada". Quem a viu passa a poder
// instalar o software em qualquer máquina, para sempre, e nenhuma coluna do
// inventário registraria isso.
//
// `VIEW_FIELD` é um CAMPO CUSTOMIZADO CIFRADO revelado (F9, D62) — o segundo e
// último `VIEW_*`, e ele não afrouxa a regra abaixo: ele a satisfaz. O teste é o
// do `VIEW_KEY`: *o simples acesso é o fato auditável, porque depois de revelado
// o valor não pode ser "des-revelado"*. A senha do BIOS ou a chave do Wi-Fi que
// alguém leu continua conhecida para sempre, e nenhuma coluna do inventário
// registraria isso.
//
// A rota que o grava RECUSA campo não cifrado com 422, e essa recusa é o que
// impede esta ação de virar o padrão que a linha seguinte proíbe: sem ela, uma
// tela poderia usar a mesma rota para ler campo comum e encher a trilha.
//
// NÃO acrescente `VIEW_*` para outras telas. Auditar leitura de dado comum
// encheria a trilha de linhas que ninguém lê e afogaria justamente estas duas.
// `LINK`, `UNLINK` e `MERGE` são da convergência com o RMM (F7). As três são
// gravadas com `entityType: 'Asset'` — quem abre o histórico do ativo quer ler
// "passou a ser a máquina PC-ANA", e um log pendurado numa entidade que a tela
// não abre não apareceria em consulta nenhuma (é o mesmo motivo do
// `ATTACH`/`DETACH`).
//
// `LINK` e `UNLINK` são o vínculo endpoint↔ativo (D45). Elas existem separadas
// de `UPDATE` porque não são edição de campo: são a afirmação de que este
// patrimônio e aquela máquina descoberta são a mesma coisa — e ela é desfeita
// SOZINHA pelo `onDelete: SetNull` quando um ativo é apagado de verdade, o que
// torna a linha de log a única testemunha do que havia antes.
//
// `MERGE` é a fusão de duas máquinas descobertas (reimagem, troca de placa).
// Operação destrutiva e sem desfazer, com o estado anterior no `changes` — é
// dela que sai a resposta para "por que esta telemetria mudou de máquina?".
// `SERVICE`, `SERVICE_CLOSE` e `AUDIT` são do ciclo de vida (F8). As três são
// gravadas com `entityType: 'Asset'`, pelo motivo do `ATTACH` e do `INSTALL`:
// quem abre a aba Histórico do notebook quer ler "entrou em reparo em março" e
// "foi conferido na Mesa 2" — um log pendurado numa entidade que a tela não abre
// não apareceria em consulta nenhuma.
//
// `SERVICE`/`SERVICE_CLOSE` convivem com o `CREATE`/`UPDATE` gravado em
// `entityType: 'Maintenance'`, e nenhuma é cópia da outra: são as duas perguntas
// que a operação responde — "o que aconteceu com este ativo" e "o que mudou
// nesta linha de manutenção". É a mesma escolha do INSTALL, escrita duas vezes
// de propósito.
//
// `AUDIT` é gravado SÓ PELA CONFERÊNCIA MANUAL. A automática (D124) roda para
// toda máquina vinculada, todo dia: uma linha de log por ativo por dia afogaria
// a trilha inteira em eventos que ninguém pediu — o mesmo motivo que impede
// `VIEW_*` de virar padrão. O registro dela é a linha em `audits`, que é a
// tabela que existe para responder "quando este ativo foi conferido".
export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'END' | 'CHECKOUT' | 'CHECKIN' | 'RETIRE' | 'UNRETIRE' | 'OFFBOARD' | 'ATTACH' | 'DETACH' | 'ACCEPT' | 'DECLINE' | 'REVOKE' | 'INSTALL' | 'UNINSTALL' | 'ADJUST' | 'VIEW_KEY' | 'VIEW_FIELD' | 'LINK' | 'UNLINK' | 'MERGE' | 'SERVICE' | 'SERVICE_CLOSE' | 'AUDIT';

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

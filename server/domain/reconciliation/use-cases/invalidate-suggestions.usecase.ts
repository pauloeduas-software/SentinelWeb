import { prisma } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';

const logger = createLogger('reconciliation.invalidacao');

// ═════════════════════════════════════════════════════════════════════════════
// A FILA APRENDE A MORRER — o D110.
//
// A fila nascia e era resolvida por uma pessoa, e isso cobria dois dos três
// caminhos. O terceiro é o mais comum de todos: **o mundo muda sozinho e a
// sugestão deixa de descrever qualquer coisa.** Alguém entrega o ativo à mão
// para a mesma pessoa que o sistema ia sugerir; alguém desfaz um vínculo; a
// posse passa para um posto. Nada disso passa por aqui, e a sugestão continuava
// `PENDING` para sempre.
//
// O estrago não era só fila suja. Aceitar uma sugestão que o mundo já realizou
// DEGRADAVA CADASTRO CERTO: o aceite de `CHECKOUT` fecha a posse aberta e abre
// outra, então aceitar "entregar à Ana" um ativo que já estava com a Ana
// gravava no histórico uma DEVOLUÇÃO QUE NUNCA ACONTECEU. O razão de posse é o
// núcleo deste produto, e um checkin inventado é pior que um inventário errado:
// ele afirma que o equipamento voltou ao estoque numa data em que não voltou.
//
// `SUPERSEDED` e não `REJECTED`, sempre: ninguém disse não. Recusa é ato de
// gente e tem memória (D97); isto é o mundo tendo andado, e não deve enterrar
// uma afirmação que amanhã pode valer de novo.
// ═════════════════════════════════════════════════════════════════════════════

const SELECT_PENDENTE = {
  id: true,
  kind: true,
  assetId: true,
  targetUserId: true,
  targetLocationId: true,
  endpoint: { select: { assetId: true, mergedIntoId: true } },
  mergeInto: { select: { mergedIntoId: true } },
} as const;

type Pendente = {
  id: string;
  kind: string;
  assetId: string | null;
  targetUserId: string | null;
  targetLocationId: string | null;
  endpoint: { assetId: string | null; mergedIntoId: string | null };
  mergeInto: { mergedIntoId: string | null } | null;
};

interface PosseAberta {
  targetType: string;
  targetUserId: string | null;
  targetLocationId: string | null;
}

/**
 * Por que ESTA sugestão não descreve mais o mundo — ou `null` se ela ainda
 * descreve.
 *
 * Devolve o motivo em texto, e não um booleano, porque ele vai para o log: sem
 * isso, "42 sugestões encerradas" é um número que ninguém sabe se é bom.
 */
function motivoDeInvalidar(
  pendente: Pendente,
  posse: PosseAberta | null | undefined,
  ocupacoesAbertas: Set<string>,
): string | null {
  // Máquina fundida em outra: TODA sugestão dela fala de um parque com duas
  // máquinas onde há uma. O merge já encerra as suas, mas quem chega depois por
  // outro caminho (o job) precisa da mesma conclusão.
  if (pendente.endpoint.mergedIntoId) return 'a máquina foi fundida em outra';

  switch (pendente.kind) {
    case 'LINK':
      // O vínculo aconteceu — com este ativo ou com outro. Nos dois casos a
      // proposta acabou: uma máquina é no máximo um ativo (invariante 12).
      return pendente.endpoint.assetId ? 'a máquina já foi vinculada a um ativo' : null;

    case 'MERGE':
      if (pendente.endpoint.assetId) return 'a máquina já foi vinculada a um ativo';
      if (pendente.mergeInto?.mergedIntoId) return 'a máquina de destino já foi fundida em outra';
      return null;

    case 'CHECKOUT': {
      if (!pendente.assetId) return null;
      if (pendente.endpoint.assetId !== pendente.assetId) {
        return 'a máquina não está mais vinculada a este ativo';
      }
      // O CADASTRO JÁ BATE. É este ramo que impedia a devolução falsa: sem ele,
      // aceitar aqui fazia checkin + checkout da mesma pessoa.
      if (posse?.targetType === 'USER' && posse.targetUserId === pendente.targetUserId) {
        return 'o ativo já está entregue a esta pessoa';
      }
      // A POSSE VIROU DE POSTO. A regra de geração diz que sugestão de checkout
      // não nasce para ativo de posto (D47); uma que nasceu ANTES da mudança
      // tem que sair da fila em vez de esperar o 409 do aceite — a fila não
      // deve oferecer o botão que destrói cadastro.
      if (posse?.targetType === 'LOCATION') return 'o ativo passou a ser de um posto de trabalho';
      return null;
    }

    case 'OCCUPANCY': {
      if (!pendente.assetId) return null;
      if (pendente.endpoint.assetId !== pendente.assetId) {
        return 'a máquina não está mais vinculada a este ativo';
      }
      if (pendente.targetLocationId && pendente.targetUserId
        && ocupacoesAbertas.has(`${pendente.targetLocationId}:${pendente.targetUserId}`)) {
        return 'a pessoa já está cadastrada como ocupante do posto';
      }
      // A ocupação é sugerida porque o ATIVO está entregue àquele posto. Se
      // deixou de estar, a evidência que sustentava a proposta sumiu.
      if (posse?.targetType !== 'LOCATION' || posse.targetLocationId !== pendente.targetLocationId) {
        return 'o ativo não está mais entregue a este posto';
      }
      return null;
    }

    case 'SHARED_POST': {
      if (!pendente.assetId) return null;
      if (pendente.endpoint.assetId !== pendente.assetId) {
        return 'a máquina não está mais vinculada a este ativo';
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Encerra as sugestões pendentes que o mundo tornou obsoletas.
 *
 * Roda no começo de cada rodada do job, ANTES de propor qualquer coisa nova: a
 * limpeza tem que vir primeiro para que a mesma rodada possa propor de novo o
 * que ainda faz sentido, e para que o painel de cobertura conte fila de verdade.
 *
 * TRÊS CONSULTAS PARA A FILA INTEIRA, e não uma por sugestão: a fila é pequena
 * por desenho (ela existe para ser esvaziada), mas um `findFirst` por linha
 * dentro de um laço é o tipo de coisa que passa despercebido até a frota
 * dobrar.
 */
export async function encerrarSugestoesObsoletas(): Promise<number> {
  const pendentes = (await prisma.reconciliationSuggestion.findMany({
    where: { state: 'PENDING' },
    select: SELECT_PENDENTE,
  })) as Pendente[];
  if (pendentes.length === 0) return 0;

  const assetIds = [...new Set(pendentes.map((p) => p.assetId).filter((id): id is string => !!id))];
  const posses = assetIds.length === 0 ? [] : await prisma.assignment.findMany({
    where: { assetId: { in: assetIds }, checkinAt: null },
    select: { assetId: true, targetType: true, targetUserId: true, targetLocationId: true },
  });
  const posseporAtivo = new Map(posses.map((posse) => [posse.assetId, posse]));

  const locationIds = [...new Set(
    pendentes.map((p) => p.targetLocationId).filter((id): id is string => !!id),
  )];
  const ocupacoes = locationIds.length === 0 ? [] : await prisma.locationOccupant.findMany({
    where: { locationId: { in: locationIds }, endedAt: null },
    select: { locationId: true, userId: true },
  });
  const ocupacoesAbertas = new Set(ocupacoes.map((o) => `${o.locationId}:${o.userId}`));

  const obsoletas: { id: string; motivo: string }[] = [];
  for (const pendente of pendentes) {
    const motivo = motivoDeInvalidar(
      pendente,
      pendente.assetId ? posseporAtivo.get(pendente.assetId) : null,
      ocupacoesAbertas,
    );
    if (motivo) obsoletas.push({ id: pendente.id, motivo });
  }
  if (obsoletas.length === 0) return 0;

  const { count } = await prisma.reconciliationSuggestion.updateMany({
    where: { id: { in: obsoletas.map((o) => o.id) }, state: 'PENDING' },
    data: { state: 'SUPERSEDED', resolvedAt: new Date() },
  });

  for (const { motivo } of obsoletas) logger.info(`[Fila] Sugestão encerrada: ${motivo}.`);
  return count;
}

/**
 * O expurgo do histórico da fila.
 *
 * Só o `SUPERSEDED`, e isso é a decisão inteira: `REJECTED` é a MEMÓRIA do D97 e
 * apagá-lo reoferece o que uma pessoa já recusou; `ACCEPTED` é a trilha de quem
 * mandou o sistema mudar o cadastro, e vive ao lado do `ActivityLog`. O que
 * sobra — a linha substituída porque o mundo andou — não responde pergunta
 * nenhuma depois de meio ano.
 *
 * Constante e não coluna de `AppSetting`: são seis meses para uma tabela de
 * trabalho interno, não uma política que alguém precise negociar. A retenção
 * que É de pessoa (`EndpointUserDaily`, D49) continua configurável, porque
 * aquela é sobre gente.
 */
export const DIAS_DE_HISTORICO_DA_FILA = 180;

export async function expurgarSugestoesSubstituidas(): Promise<number> {
  const limite = new Date(Date.now() - DIAS_DE_HISTORICO_DA_FILA * 24 * 60 * 60 * 1000);
  const { count } = await prisma.reconciliationSuggestion.deleteMany({
    where: { state: 'SUPERSEDED', resolvedAt: { lt: limite } },
  });
  if (count > 0) logger.info(`[Fila] ${count} sugestão(ões) substituída(s) expurgada(s).`);
  return count;
}

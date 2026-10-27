import type { ListEnvelope } from '../../../core/http/list-query';
import { listAssetAssignments } from '../../assignment/use-cases/list-asset-assignments.usecase';
import { rotuloDoAlvo } from '../../assignment/helpers/target-label.helper';
import type { AlvoPosse } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { buscarEntregasDoAtivo } from '../../license/use-cases/list-target-checkouts.usecase';
import { eventosDaEntregaDeLicenca, type EventoDeLicenca } from '../../license/helpers/license-events.helper';
import { buscarUnidadesDoAlvo, eventosDasUnidades, type EventoDeEstoque } from '../../stock/helpers/stock-events.helper';

// A LINHA DO TEMPO DE UM ATIVO — a aba Histórico da tela de detalhe.
//
// É SÓ MOVIMENTAÇÃO: por onde o ativo passou — as entregas e devoluções, as
// licenças entregues a ele e os componentes instalados e retirados (AI). Cadastro, edição, lixeira, baixa e vínculo de
// máquina ficam na auditoria (`audit_logs`, AB), que tela nenhuma lê: ela é do
// administrador, no banco. O estado atual da baixa e da máquina a tela já
// mostra nas abas Detalhes e Máquina.

/** De onde o evento veio. A tela usa para escolher o ícone e o título. */
type FonteDoEvento = 'POSSE' | 'LICENCA' | 'COMPONENTE';

/** O que um evento de posse diz: para quem, e com que observação. */
interface EventoDePosse {
  assignmentId: string;
  targetType: AlvoPosse;
  /** "Laura Souza", "Mesa 1", "ATV-00012 — Dell Latitude". */
  targetLabel: string | null;
  /** As observações da entrega ou da devolução, conforme o evento. */
  notes: string | null;
  expectedCheckinAt: Date | null;
}

export interface EventoDoAtivo {
  /**
   * Chave ESTÁVEL para a tela, com prefixo da fonte: os dois lados têm uuid
   * próprio e uma assignment rende DOIS eventos (a entrega e a devolução), que
   * colidiriam se a chave fosse só o id da linha.
   */
  id: string;
  fonte: FonteDoEvento;
  action: string;
  at: Date;
  posse: EventoDePosse | null;
  licenca: EventoDeLicenca | null;
  /** O componente instalado ou retirado: qual item, e quantas unidades. */
  componente: EventoDeEstoque | null;
}

/** Quanto a tela recebe quando não pede nada. O TETO é do schema, na borda. */
const LIMITE_PADRAO = 100;

/** Uma posse vira UM ou DOIS eventos: a entrega sempre, a devolução se houve. */
function eventosDaPosse(assignment: Awaited<ReturnType<typeof listAssetAssignments>>[number]): EventoDoAtivo[] {
  const alvo = {
    assignmentId: assignment.id,
    targetType: assignment.targetType,
    targetLabel: rotuloDoAlvo(assignment),
    expectedCheckinAt: assignment.expectedCheckinAt,
  };

  const entrega: EventoDoAtivo = {
    id: `posse:${assignment.id}:entrega`,
    fonte: 'POSSE',
    action: 'CHECKOUT',
    at: assignment.checkoutAt,
    posse: { ...alvo, notes: assignment.checkoutNotes },
    licenca: null,
    componente: null,
  };

  if (!assignment.checkinAt) return [entrega];

  return [
    {
      id: `posse:${assignment.id}:devolucao`,
      fonte: 'POSSE',
      action: 'CHECKIN',
      at: assignment.checkinAt,
      posse: { ...alvo, notes: assignment.checkinNotes },
      licenca: null,
      componente: null,
    },
    entrega,
  ];
}

/**
 * Tudo que aconteceu com um ativo, do mais recente para o mais antigo.
 *
 * Três fontes, uma lista: `assignments` (entregas e devoluções, com o nome de
 * quem recebeu), `license_checkouts` (as licenças entregues A ESTA MÁQUINA —
 * as da pessoa que responde por ela ficam no histórico dela) e
 * `stock_movements` (os componentes, AI).
 *
 * O envelope é o `{ total, rows }` de toda listagem, mas `total` aqui conta os
 * eventos das TRÊS fontes: é ele que diz à tela que existe história além do
 * teto — sem ele, uma lista cortada em 100 é indistinguível de um ativo com
 * exatamente 100 eventos.
 *
 * Juntar as fontes e cortar depois do merge devolve o topo REAL.
 */
export async function getAssetHistory(
  assetId: string,
  limite = LIMITE_PADRAO,
): Promise<ListEnvelope<EventoDoAtivo>> {
  // `listAssetAssignments` é quem confere se o ativo existe (404) — o mesmo
  // 404 da tela de detalhe, escrito uma vez só. Importado do domínio de posse,
  // nunca recopiado: a leitura da posse é de lá.
  const [assignments, entregasDeLicenca, componentes] = await Promise.all([
    listAssetAssignments(assetId),
    buscarEntregasDoAtivo(assetId, { abertas: false }),
    buscarUnidadesDoAlvo({ targetAssetId: assetId }),
  ]);

  const daPosse = assignments.flatMap(eventosDaPosse);
  const daLicenca: EventoDoAtivo[] = entregasDeLicenca.flatMap((entrega) => eventosDaEntregaDeLicenca(entrega)
    .map((evento) => ({ ...evento, fonte: 'LICENCA' as const, posse: null, componente: null })));
  const doComponente: EventoDoAtivo[] = eventosDasUnidades(componentes)
    .map(({ estoque, ...evento }) => ({ ...evento, fonte: 'COMPONENTE' as const, posse: null, licenca: null, componente: estoque }));

  const eventos = [...daPosse, ...daLicenca, ...doComponente].sort((a, b) => b.at.getTime() - a.at.getTime());

  return { total: eventos.length, rows: eventos.slice(0, limite) };
}

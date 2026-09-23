import type { EventoDoAtivo } from '../../../../domain/shared/asset.types';
import { lerEvento, rotuloDaAcao, type LeituraDoEvento } from '../../../helpers/historico.helper';

// O que a aba Histórico do ATIVO acrescenta ao leitor genérico
// (`src/pages/helpers/historico.helper.ts`): os nomes das colunas de `assets` e
// a frase do título. O resto — separar diff de detalhe, formatar valor, ler a
// hora — vale para qualquer trilha e mora lá.

/** As ações que só o ativo tem. As comuns estão no leitor genérico. */
const ROTULO_DA_ACAO: Record<string, string> = {
  RETIRE: 'Descomissionado',
  UNRETIRE: 'Voltou ao patrimônio',
};

/** Os nomes de coluna que aparecem no diff, em português. */
const ROTULO_DO_CAMPO: Record<string, string> = {
  assetTag: 'Etiqueta',
  serial: 'Número de série',
  name: 'Nome',
  notes: 'Notas',
  byod: 'BYOD',
  requestable: 'Pode ser solicitado',
  statusId: 'Status',
  modelId: 'Modelo',
  locationId: 'Localização',
  supplierId: 'Fornecedor',
  assignedToId: 'Responsável direto',
  orderNumber: 'Número do pedido',
  purchaseDate: 'Data da compra',
  purchaseCost: 'Valor de compra',
  warrantyMonths: 'Garantia (meses)',
  warrantyExpiresAt: 'Vencimento da garantia',
  eolMonths: 'Vida útil (meses)',
  eolDate: 'Fim de vida',
  eolExplicit: 'Fim de vida à mão',
  retiredAt: 'Saída do patrimônio',
  retiredReason: 'Motivo da saída',
  batchId: 'Lote',
  batchSize: 'Ativos no lote',
  op: 'Operação em massa',
  assignmentId: 'Posse',
  targetType: 'Tipo de alvo',
  targetId: 'Alvo',
};

export function lerEventoDoAtivo(evento: EventoDoAtivo): LeituraDoEvento {
  return lerEvento(evento, ROTULO_DO_CAMPO);
}

/**
 * A linha de assunto do evento: "Entregue para Laura Souza", "Editado".
 *
 * O alvo entra só nos eventos de posse, porque só neles ele existe — e é a
 * informação que o operador procura quando abre a aba ("para quem foi?").
 */
export function tituloDoEvento(evento: EventoDoAtivo): string {
  const acao = rotuloDaAcao(evento.action, ROTULO_DA_ACAO);
  if (!evento.posse?.targetLabel) return acao;

  return evento.action === 'CHECKOUT'
    ? `${acao} para ${evento.posse.targetLabel}`
    : `${acao} de ${evento.posse.targetLabel}`;
}

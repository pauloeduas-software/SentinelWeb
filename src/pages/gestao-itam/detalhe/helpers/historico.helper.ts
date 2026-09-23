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
  // Peça de estoque posta e retirada de dentro do ativo (F5). Palavras
  // próprias, e não os ATTACH/DETACH do anexo: os dois eventos caem nesta
  // mesma lista, e "anexo posto" para a nota fiscal e para o pente de RAM
  // seria uma linha do tempo em que ninguém distingue documento de hardware.
  INSTALL: 'Componente instalado',
  UNINSTALL: 'Componente retirado',
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
  // Estoque (F5). `assetTag` não entra: já está no topo, e a chave é a mesma.
  instalacaoId: 'Instalação',
  componentId: 'Componente',
  componentName: 'Nome do componente',
  assetId: 'Ativo',
  qty: 'Unidades',
  retirada: 'Unidades retiradas',
  de: 'Instaladas antes',
  sucessoraId: 'Continua instalado (linha)',
  disponivel: 'Disponível depois',
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

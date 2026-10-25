import type { EventoDoAtivo, MotivoDaSaida } from '../../../../domain/shared/asset.types';
import { lerEvento, rotuloDaAcao, type LeituraDoEvento } from '../../../helpers/historico.helper';
import { rotuloDoMotivo } from '../../helpers/baixa.helper';

// O que a aba Histórico do ATIVO acrescenta ao leitor genérico
// (`src/pages/helpers/historico.helper.ts`): os nomes das colunas de `assets`, o
// motivo da saída em português e a frase do título. O resto — separar diff de
// detalhe, formatar valor, ler a hora — vale para qualquer trilha e mora lá.

/** As ações que só o ativo tem. As comuns estão no leitor genérico. */
const ROTULO_DA_ACAO: Record<string, string> = {
  RETIRE: 'Baixa do patrimônio',
  UNRETIRE: 'Voltou ao patrimônio',
  // O vínculo com a máquina descoberta (F7, D45). Está aqui e não no leitor
  // genérico porque é gravado com `entityType: 'Asset'`: a aba Histórico do
  // ativo é a única tela que o mostra.
  LINK: 'Máquina vinculada',
  UNLINK: 'Máquina desvinculada',
};

/** As entregas de licença ao ativo — a fonte `LICENCA`. */
const ROTULO_DA_LICENCA: Record<string, string> = {
  CHECKOUT: 'Licença entregue',
  CHECKIN: 'Licença devolvida',
};

/** Os nomes de coluna que aparecem no diff, em português. */
const ROTULO_DO_CAMPO: Record<string, string> = {
  assetTag: 'Etiqueta',
  serial: 'Número de série',
  name: 'Nome',
  notes: 'Notas',
  statusId: 'Status',
  modelId: 'Modelo',
  locationId: 'Localização',
  orderNumber: 'Número do pedido',
  purchaseDate: 'Data da compra',
  purchaseCost: 'Valor de compra',
  retiredAt: 'Saída do patrimônio',
  retiredReason: 'Motivo da saída',
  // A observação que o RETIRE grava no `changes`. Chave própria, e não
  // `notes`: com `notes` ela saía como "Notas" e se confundia com as notas do
  // ativo, que são outra coisa (um campo da ficha, não um registro do evento).
  observacao: 'Observação da baixa',
  // O que o `LINK`/`UNLINK` grava no `changes` (F7).
  hostname: 'Máquina',
  hwid: 'Identificador da máquina',
  origem: 'Origem do vínculo',
  sinal: 'Sinal que casou',
};

/**
 * O motivo da saída no vocabulário da tela ("Vendido", não "VENDIDO").
 *
 * Traduzido AQUI, depois do leitor genérico, e não no `valorLegivel`: o enum é
 * do ativo, e o leitor genérico serve também à pessoa. Valor vazio já chega
 * como "—" e passa direto — `rotuloDoMotivo` devolveria o mesmo traço.
 */
function motivoLegivel(campo: string, valor: string): string {
  return campo === 'retiredReason' ? rotuloDoMotivo(valor as MotivoDaSaida) : valor;
}

export function lerEventoDoAtivo(evento: EventoDoAtivo): LeituraDoEvento {
  const leitura = lerEvento(evento, ROTULO_DO_CAMPO);
  return {
    mudancas: leitura.mudancas.map((mudanca) => ({
      ...mudanca,
      de: motivoLegivel(mudanca.campo, mudanca.de),
      para: motivoLegivel(mudanca.campo, mudanca.para),
    })),
    detalhes: leitura.detalhes.map((detalhe) => ({
      ...detalhe,
      valor: motivoLegivel(detalhe.campo, detalhe.valor),
    })),
  };
}

/**
 * A linha de assunto do evento: "Entregue para Laura Souza", "Editado".
 *
 * O alvo entra só nos eventos de posse, porque só neles ele existe — e é a
 * informação que o operador procura quando abre a aba ("para quem foi?").
 */
export function tituloDoEvento(evento: EventoDoAtivo): string {
  if (evento.licenca) {
    const acao = rotuloDaAcao(evento.action, ROTULO_DA_LICENCA);
    return `${acao}: ${evento.licenca.licenseLabel}`;
  }

  const acao = rotuloDaAcao(evento.action, ROTULO_DA_ACAO);
  if (!evento.posse?.targetLabel) return acao;

  return evento.action === 'CHECKOUT'
    ? `${acao} para ${evento.posse.targetLabel}`
    : `${acao} de ${evento.posse.targetLabel}`;
}

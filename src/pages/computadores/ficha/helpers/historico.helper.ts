import type { EventoDoAtivo } from '../../../../types/asset.types';
import { textoDeUnidades } from '../../../../helpers/estoque.helper';
import { rotuloDaAcao } from '../../../../helpers/historico.helper';

// O que a aba Histórico do ATIVO acrescenta ao leitor genérico
// (`src/helpers/historico.helper.ts`): a frase do título. O resto — o
// rótulo da ação, ler a hora — vale para qualquer trilha e mora lá.

/** As entregas de licença ao ativo — a fonte `LICENCA`. */
const ROTULO_DA_LICENCA: Record<string, string> = {
  CHECKOUT: 'Licença entregue',
  CHECKIN: 'Licença devolvida',
};

/** Os componentes instalados e retirados — a fonte `COMPONENTE` (AI). */
const ROTULO_DO_COMPONENTE: Record<string, string> = {
  CHECKOUT: 'Componente instalado',
  CHECKIN: 'Componente retirado',
};

/**
 * A linha de assunto do evento: "Entregue para Laura Souza".
 *
 * O alvo entra só nos eventos de posse, porque só neles ele existe — e é a
 * informação que o operador procura quando abre a aba ("para quem foi?").
 */
export function tituloDoEvento(evento: EventoDoAtivo): string {
  if (evento.licenca) {
    const acao = rotuloDaAcao(evento.action, ROTULO_DA_LICENCA);
    return `${acao}: ${evento.licenca.licenseLabel}`;
  }

  if (evento.componente) {
    const acao = rotuloDaAcao(evento.action, ROTULO_DO_COMPONENTE);
    return `${acao}: ${evento.componente.itemLabel} · ${textoDeUnidades(evento.componente.unidades)}`;
  }

  const acao = rotuloDaAcao(evento.action);
  if (!evento.posse?.targetLabel) return acao;

  return evento.action === 'CHECKOUT'
    ? `${acao} para ${evento.posse.targetLabel}`
    : `${acao} de ${evento.posse.targetLabel}`;
}

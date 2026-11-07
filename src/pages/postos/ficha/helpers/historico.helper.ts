import type { EventoDoPosto } from '../../../../types/workstation.types';
import { textoDeUnidades } from '../../../../helpers/estoque.helper';
import { rotuloDaAcao } from '../../../../helpers/historico.helper';

// O que o Histórico do POSTO acrescenta ao leitor genérico
// (`src/helpers/historico.helper.ts`): a frase do título, que depende da fonte.

/** `CREATE` e `END` da ocupação: as palavras do histórico da pessoa, vistas do posto. */
const ROTULO_DA_OCUPACAO: Record<string, string> = {
  CREATE: 'Entrou no posto',
  END: 'Saiu do posto',
};

/** O estoque entregue à mesa, por entrega. */
const ROTULO_DO_ESTOQUE: Record<string, string> = {
  CHECKOUT: 'Recebeu',
  CHECKIN: 'Devolveu',
};

/**
 * A linha de assunto do evento, do ponto de vista do posto: "Entrou no posto: Laura
 * Souza (Manhã)", "Entregue: ATV-00012 — Dell Latitude", "Recebeu: Mouse USB · 2 unidades".
 */
export function tituloDoEvento(evento: EventoDoPosto): string {
  if (evento.ocupacao) {
    const acao = rotuloDaAcao(evento.action, ROTULO_DA_OCUPACAO);
    const turno = evento.ocupacao.shift ? ` (${evento.ocupacao.shift})` : '';
    return `${acao}: ${evento.ocupacao.personLabel}${turno}`;
  }

  if (evento.estoque) {
    const acao = rotuloDaAcao(evento.action, ROTULO_DO_ESTOQUE);
    return `${acao}: ${evento.estoque.itemLabel} · ${textoDeUnidades(evento.estoque.unidades)}`;
  }

  const acao = rotuloDaAcao(evento.action);
  return evento.posse ? `${acao}: ${evento.posse.assetLabel}` : acao;
}

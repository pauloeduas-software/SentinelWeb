import type { EventoDaPessoa } from '../../../../domain/shared/person.types';
import { lerEvento, rotuloDaAcao, type LeituraDoEvento } from '../../../helpers/historico.helper';

// O que o Histórico da PESSOA acrescenta ao leitor genérico
// (`src/pages/helpers/historico.helper.ts`): os nomes das colunas de `people`, o
// segundo mapa de ação (o do POSTO) e a frase do título — que aqui depende da
// FONTE, e não só da ação.

/**
 * `CREATE` e `END` vindos da fonte POSTO querem dizer outra coisa.
 *
 * O servidor usa o vocabulário do `ActivityLog` para a ocupação — é uma palavra
 * só para o mesmo evento em todo o sistema (ver `person-history.usecase.ts`) —, e
 * quem desfaz a ambiguidade é a fonte. Sem este segundo mapa, "entrou na Mesa 1"
 * apareceria como "Cadastrado" no meio da linha do tempo da pessoa.
 */
const ROTULO_DA_ACAO_NO_POSTO: Record<string, string> = {
  CREATE: 'Entrou no posto',
  END: 'Saiu do posto',
};

/** As entregas de licença A ELA — a fonte `LICENCA`. */
const ROTULO_DA_ACAO_NA_LICENCA: Record<string, string> = {
  CHECKOUT: 'Recebeu a licença',
  CHECKIN: 'Devolveu a licença',
};

/** Os nomes de coluna que aparecem no diff, em português. */
const ROTULO_DO_CAMPO: Record<string, string> = {
  name: 'Nome',
  email: 'E-mail',
  isActive: 'Ativo',
};

export function lerEventoDaPessoa(evento: EventoDaPessoa): LeituraDoEvento {
  return lerEvento(evento, ROTULO_DO_CAMPO);
}

/**
 * A linha de assunto do evento, do ponto de vista da pessoa.
 *
 * As fontes falam de coisas diferentes e por isso a frase muda: a posse nomeia
 * o EQUIPAMENTO ("Entregue: ATV-00012 — Dell Latitude"), o posto nomeia o LUGAR
 * e o turno ("Entrou no posto: Mesa 1 (Manhã)"), a licença nomeia o SOFTWARE
 * ("Recebeu a licença: Microsoft 365"), e a atividade fala da própria pessoa
 * ("Editado").
 *
 * É o espelho do título do ativo, que nomeia o ALVO — lá a pergunta é "para
 * quem foi?", aqui é "o que ela recebeu?".
 */
export function tituloDoEvento(evento: EventoDaPessoa): string {
  if (evento.fonte === 'POSSE' && evento.posse) {
    return `${rotuloDaAcao(evento.action)}: ${evento.posse.assetLabel}`;
  }

  if (evento.fonte === 'POSTO' && evento.posto) {
    const acao = rotuloDaAcao(evento.action, ROTULO_DA_ACAO_NO_POSTO);
    const turno = evento.posto.shift ? ` (${evento.posto.shift})` : '';
    return `${acao}: ${evento.posto.workstationLabel}${turno}`;
  }

  if (evento.fonte === 'LICENCA' && evento.licenca) {
    const acao = rotuloDaAcao(evento.action, ROTULO_DA_ACAO_NA_LICENCA);
    return `${acao}: ${evento.licenca.licenseLabel}`;
  }

  return rotuloDaAcao(evento.action);
}

import type { EventoDaPessoa } from '../../../../domain/shared/user.types';
import { lerEvento, rotuloDaAcao, type LeituraDoEvento } from '../../../helpers/historico.helper';

// O que a aba Histórico da PESSOA acrescenta ao leitor genérico
// (`src/pages/helpers/historico.helper.ts`): os nomes das colunas de `users`, a
// palavra do desligamento e a frase do título — que aqui depende da FONTE, e
// não só da ação.

/** As ações que só a pessoa tem. As comuns estão no leitor genérico. */
const ROTULO_DA_ACAO: Record<string, string> = {
  OFFBOARD: 'Desligado',
};

/**
 * `CREATE` e `END` vindos da fonte POSTO querem dizer outra coisa.
 *
 * O servidor usa o vocabulário do `ActivityLog` para a ocupação — é uma palavra
 * só para o mesmo evento em todo o sistema (ver `user-history.usecase.ts`) —, e
 * quem desfaz a ambiguidade é a fonte. Sem este segundo mapa, "entrou na Mesa 1"
 * apareceria como "Cadastrado" no meio da linha do tempo da pessoa.
 */
const ROTULO_DA_ACAO_NO_POSTO: Record<string, string> = {
  CREATE: 'Entrou no posto',
  END: 'Saiu do posto',
};

/** Os nomes de coluna que aparecem no diff, em português. */
const ROTULO_DO_CAMPO: Record<string, string> = {
  name: 'Nome',
  email: 'E-mail',
  department: 'Departamento',
  username: 'Usuário de acesso',
  credencial: 'Credencial',
  isActive: 'Ativo',
  terminatedAt: 'Desligamento',
  // Gravados pelo `OFFBOARD`: é o placar do que a operação fechou.
  ativosDevolvidos: 'Ativos devolvidos',
  ocupacoesEncerradas: 'Postos desocupados',
  notes: 'Observações',
};

export function lerEventoDaPessoa(evento: EventoDaPessoa): LeituraDoEvento {
  return lerEvento(evento, ROTULO_DO_CAMPO);
}

/**
 * A linha de assunto do evento, do ponto de vista da pessoa.
 *
 * As três fontes falam de coisas diferentes e por isso a frase muda: a posse
 * nomeia o EQUIPAMENTO ("Entregue: ATV-00012 — Dell Latitude"), o posto nomeia
 * o LUGAR e o turno ("Entrou no posto: Mesa 1 (Manhã)"), e a atividade fala da
 * própria pessoa ("Editado").
 *
 * É o espelho do título do ativo, que nomeia o ALVO — lá a pergunta é "para
 * quem foi?", aqui é "o que ela recebeu?".
 */
export function tituloDoEvento(evento: EventoDaPessoa): string {
  if (evento.fonte === 'POSSE' && evento.posse) {
    return `${rotuloDaAcao(evento.action, ROTULO_DA_ACAO)}: ${evento.posse.assetLabel}`;
  }

  if (evento.fonte === 'POSTO' && evento.posto) {
    const acao = rotuloDaAcao(evento.action, ROTULO_DA_ACAO_NO_POSTO);
    const turno = evento.posto.shift ? ` (${evento.posto.shift})` : '';
    return `${acao}: ${evento.posto.locationLabel}${turno}`;
  }

  return rotuloDaAcao(evento.action, ROTULO_DA_ACAO);
}

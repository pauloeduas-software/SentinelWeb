import { useEndpointQuery, useSendCommand } from '../queries/endpoint.queries';
import type { AgentAction } from '../types/endpoint.types';
import { confirmar } from './useConfirmacao';
import { useNotificacao } from './useNotificacao';

// A MÁQUINA AGORA: a amostra que chega sozinha e os comandos que se manda nela.
//
// Hook COMPARTILHADO, em `src/hooks`, pelo mesmo motivo do `useOcupantes`: as
// duas telas que mostram uma máquina fazem a mesma coisa com ela, e duas cópias
// divergiriam no primeiro ajuste. A aba Máquina do ativo pergunta "como está o
// equipamento desta ficha"; a ficha do posto pergunta "como está o computador
// desta mesa" — e a resposta é a mesma consulta.
//
// ─────────────────────────────────────────────────────────────────────────────
// A CONFIRMAÇÃO FICA, E O ALERT NÃO.
//
// `confirmar` porque desligar uma máquina é irreversível pela tela: não há botão
// de desfazer, e quem está do outro lado perde o que não salvou. É o mesmo lugar
// em que o `handleDelete` do catálogo tem o dele — no hook, nunca no componente.
//
// Ela NOMEIA a máquina e diz a consequência DAQUELE comando, e as duas coisas
// têm o mesmo motivo: a pergunta é uma caixa que cobre a página, então o que
// estava na tela identificando o equipamento não está mais visível quando a
// pessoa lê a pergunta. E a consequência não é uma só — suspender não perde
// trabalho nenhum, a máquina dorme com as janelas abertas. Uma frase genérica
// que vale para o pior caso ensina a ignorar a caixa.
//
// A RESPOSTA, por outro lado, não é mais um `alert`. Ela tem o que dizer: o 409
// nomeia a máquina que não respondeu e explica que o comando não fica em fila. Um
// `alert` com esse texto obriga a pessoa a fechá-lo para continuar; a notificação
// diz o mesmo sem travar a tela.
// ─────────────────────────────────────────────────────────────────────────────

/** Um comando e o que ele causa — o texto que a confirmação mostra. */
export interface ComandoDaMaquina {
  action: AgentAction;
  rotulo: string;
  consequencia: string;
  /** Quem usa a máquina perde o que não salvou: o botão da pergunta sai no vermelho. */
  perigo?: boolean;
}

export function useMaquinaAoVivo(endpointId: string | null) {
  const notificar = useNotificacao();
  const { data: maquina, isPending, isError, error } = useEndpointQuery(endpointId);
  const enviarComando = useSendCommand();

  const handleComando = async ({ action, rotulo, consequencia, perigo }: ComandoDaMaquina) => {
    if (!endpointId) return;

    const qual = maquina?.hostname ?? 'esta máquina';
    if (!(await confirmar({ titulo: `${rotulo} "${qual}"?`, descricao: consequencia, acao: rotulo, perigo }))) return;

    // A resposta anterior sai da tela ANTES do envio: deixá-la ali durante a
    // requisição faria o resultado do comando passado parecer o do atual.
    notificar.limpar();

    try {
      await enviarComando.mutateAsync({ endpointId, action });
      notificar.sucesso(`Comando de ${rotulo.toLowerCase()} entregue ao agente de ${qual}.`);
    } catch (erro) {
      notificar.erro((erro as Error).message);
    }
  };

  return {
    maquina: maquina ?? null,
    // `isPending` com `enabled: false` é verdade para sempre — a consulta nunca
    // vai acontecer. Sem o `endpointId` no `&&`, a tela de um ativo sem máquina
    // ficaria "Carregando…" eternamente.
    carregando: endpointId != null && isPending,
    erro: isError ? (error as Error).message : null,
    enviando: enviarComando.isPending,
    handleComando,
  };
}

import { useState } from 'react';
import { useEndpointQuery, useSendCommand } from '../../domain/endpoint/endpoint.queries';
import type { AgentAction } from '../../domain/shared/endpoint.types';

// A MÁQUINA AGORA: a amostra que chega sozinha e os comandos que se manda nela.
//
// Hook COMPARTILHADO, em `pages/hooks`, pelo mesmo motivo do `useOcupantes`: as
// duas telas que mostram uma máquina fazem a mesma coisa com ela, e duas cópias
// divergiriam no primeiro ajuste. A aba Máquina do ativo pergunta "como está o
// equipamento desta ficha"; a ficha do posto pergunta "como está o computador
// desta mesa" — e a resposta é a mesma consulta.
//
// ─────────────────────────────────────────────────────────────────────────────
// O CONFIRM FICA, E O ALERT NÃO.
//
// `confirm` porque desligar uma máquina é irreversível pela tela: não há botão
// de desfazer, e quem está do outro lado perde o que não salvou. É o mesmo lugar
// em que o `handleDelete` do catálogo tem o dele — no hook, nunca no componente.
//
// Ele NOMEIA a máquina e diz a consequência DAQUELE comando, e as duas coisas
// têm o mesmo motivo: o `confirm` é uma caixa que cobre a página, então o que
// estava na tela identificando o equipamento não está mais visível quando a
// pessoa lê a pergunta. E a consequência não é uma só — suspender não perde
// trabalho nenhum, a máquina dorme com as janelas abertas. Uma frase genérica
// que vale para o pior caso ensina a ignorar a caixa.
//
// A RESPOSTA, por outro lado, não é mais um `alert`. Ela tem o que dizer: o 409
// nomeia a máquina que não respondeu e explica que o comando não fica em fila. Um
// `alert` com esse texto obriga a pessoa a fechá-lo para continuar e não deixa
// rastro na tela; aqui a frase fica ao lado do botão que a produziu.
// ─────────────────────────────────────────────────────────────────────────────

/** O que aconteceu com o último comando, para a tela dizer algo. */
interface RetornoDoComando {
  tipo: 'enviado' | 'falhou';
  texto: string;
}

/** Um comando e o que ele causa — o texto que o `confirm` mostra. */
export interface ComandoDaMaquina {
  action: AgentAction;
  rotulo: string;
  consequencia: string;
}

export function useMaquinaAoVivo(endpointId: string | null) {
  const { data: maquina, isPending, isError, error } = useEndpointQuery(endpointId);
  const enviarComando = useSendCommand();

  // O retorno guarda A QUAL MÁQUINA pertence. A tela do ativo é reaproveitada
  // pelo roteador de um `/computadores/:id` para outro, então sem isto o "comando
  // entregue" da máquina anterior ficaria embaixo dos botões da seguinte.
  const [retorno, setRetorno] = useState<(RetornoDoComando & { endpointId: string }) | null>(null);

  const handleComando = async ({ action, rotulo, consequencia }: ComandoDaMaquina) => {
    if (!endpointId) return;

    const qual = maquina?.hostname ?? 'esta máquina';
    if (!confirm(`${rotulo} ${qual}? ${consequencia}`)) return;

    // O retorno anterior sai da tela ANTES do envio: deixá-lo ali durante a
    // requisição faria o resultado do comando passado parecer o do atual.
    setRetorno(null);

    try {
      await enviarComando.mutateAsync({ endpointId, action });
      setRetorno({
        endpointId,
        tipo: 'enviado',
        texto: `Comando de ${rotulo.toLowerCase()} entregue ao agente de ${qual}.`,
      });
    } catch (erro) {
      setRetorno({ endpointId, tipo: 'falhou', texto: (erro as Error).message });
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
    retorno: retorno?.endpointId === endpointId ? retorno : null,
    handleComando,
  };
}

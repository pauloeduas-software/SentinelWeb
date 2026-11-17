import {
  useDesvincularMaquina, useExcluirMaquina, useVincularEEntregar, useVincularMaquina,
} from '../../../queries/reconciliation.queries';
import { linksDoErro } from '../../../helpers/erro.helper';
import { confirmar } from '../../../hooks/useConfirmacao';
import { useNotificacao } from '../../../hooks/useNotificacao';

// O QUE SE FAZ COM UMA MÁQUINA: vincular, desvincular e excluir, com a pergunta e o
// cartão de cada um. A linha da lista e a ficha da máquina (DF) usam o mesmo.

/** O que as perguntas precisam da máquina: a linha da lista e a ficha têm. */
interface MaquinaDaAcao {
  id: string;
  hostname: string;
  asset: { assetTag: string } | null;
}

export function useAcoesDaMaquina() {
  const notificar = useNotificacao();
  const vincular = useVincularMaquina();
  const vincularEEntregar = useVincularEEntregar();
  const desvincular = useDesvincularMaquina();
  const excluir = useExcluirMaquina();

  return {
    ocupado: vincular.isPending || vincularEEntregar.isPending || desvincular.isPending || excluir.isPending,

    /**
     * VINCULAR À MÃO, e opcionalmente ENTREGAR ao posto na mesma ida.
     *
     * PROPAGA em vez de notificar: é no painel do formulário que a recusa
     * precisa aparecer — "este posto já tem um computador", ou "a máquina foi
     * vinculada, mas a entrega não aconteceu".
     */
    handleVincular: async (endpointId: string, assetId: string, targetWorkstationId: string | null) => {
      if (targetWorkstationId) {
        await vincularEEntregar.mutateAsync({ endpointId, assetId, targetWorkstationId });
      } else {
        await vincular.mutateAsync({ endpointId, assetId });
      }
    },

    /**
     * DESVINCULAR é a correção de um vínculo errado e a troca de placa-mãe. Tem
     * volta, então pergunta sem vermelho. A recusa do servidor é explicação, e
     * vai para o cartão.
     */
    handleDesvincular: async (maquina: MaquinaDaAcao) => {
      if (!(await confirmar({
        titulo: `Desvincular esta máquina de "${maquina.asset?.assetTag}"?`,
        descricao: 'A máquina volta para Sem computador e não se vincula de novo sozinha. Vincule à mão quando souber qual computador ela é.',
        acao: 'Desvincular',
      }))) return;

      notificar.limpar();
      try {
        await desvincular.mutateAsync(maquina.id);
        notificar.sucesso('Máquina desvinculada.');
      } catch (falha) {
        // `ErroDaApi` já traz a frase do servidor no `message` (`apiClient.ts`).
        notificar.erro((falha as Error).message || 'Não foi possível desvincular a máquina.');
      }
    },

    /**
     * EXCLUIR é da máquina que não existe mais, ou não deveria estar ali (DD):
     * ela sai da lista e o agente dela perde o acesso. Sem lixeira, e só volta
     * reinstalando o agente, então pergunta em vermelho. `true` quando excluiu: a
     * ficha volta para a lista.
     */
    handleExcluir: async (maquina: MaquinaDaAcao): Promise<boolean> => {
      if (!(await confirmar({
        titulo: `Excluir a máquina "${maquina.hostname}"?`,
        descricao: 'Ela sai da lista e o agente dela perde o acesso na hora. Esta ação não tem lixeira: a máquina só volta reinstalando o agente.',
        acao: 'Excluir',
        perigo: true,
      }))) return false;

      notificar.limpar();
      try {
        await excluir.mutateAsync(maquina.id);
        notificar.sucesso('Máquina excluída.');
        return true;
      } catch (falha) {
        notificar.erro((falha as Error).message || 'Não foi possível excluir a máquina.', linksDoErro(falha));
        return false;
      }
    },
  };
}

import { useState } from 'react';
import {
  useAceitarSugestao, useCoberturaQuery, useConfiguracaoDaDescobertaQuery,
  useDesvincularMaquina, useOciososQuery, useReconciliarAgora, useRecusarSugestao, useSalvarConfiguracaoDaDescoberta,
  useSugestoesQuery, useTriarMaquina, useVincularEEntregar, useVincularMaquina,
} from '../../../queries/reconciliation.queries';
import { useEndpointsQuery } from '../../../queries/endpoint.queries';
import { useAbaNaUrl } from '../../../hooks/useAbaNaUrl';
import { confirmar } from '../../../hooks/useConfirmacao';
import { useNotificacao } from '../../../hooks/useNotificacao';
import { usePode } from '../../../stores/auth.store';
import type { Endpoint } from '../../../types/endpoint.types';
import type {
  ConfiguracaoDaDescoberta, ResultadoDaVarredura, ReviewState,
} from '../../../types/reconciliation.types';

// O ESTADO DA TELA DE DESCOBERTAS. A página é markup e mais nada
// (docs/referencia/arquitetura.md).

/**
 * As quatro abas. `sem` e `com` são as DUAS LISTAS de máquinas — o que o agente
 * vê e o cadastro não sabe, e o que já é patrimônio —, e são o recorte do
 * servidor (`?vinculo=`), não um `filter` sobre a frota inteira.
 */
const ABAS = ['fila', 'sem', 'com', 'ociosos'] as const;
export type AbaDaTela = typeof ABAS[number];

/** A frase do cartão depois da triagem, no masculino do Status concordando com a máquina (BU). */
const TRIAGEM_SALVA: Record<Exclude<ReviewState, 'UNREVIEWED'>, string> = {
  ALLOWED: 'Máquina marcada como conhecida.',
  BLOCKED: 'Máquina marcada como não autorizada.',
};

/** O placar da rodada: "3 sugestões · 1 vínculo" é a resposta à pergunta de quem clicou. */
function placarDaVarredura({ endpoints, sugeridas, vinculadas, encerradas }: ResultadoDaVarredura): string {
  return [
    `${endpoints} máquina${endpoints === 1 ? '' : 's'} sem vínculo`,
    `${sugeridas} sugest${sugeridas === 1 ? 'ão' : 'ões'}`,
    `${vinculadas} vínculo${vinculadas === 1 ? '' : 's'}`,
    `${encerradas} encerrada${encerradas === 1 ? '' : 's'}`,
  ].join(' · ');
}

export function useDescobertas() {
  const notificar = useNotificacao();
  const [aba, setAba] = useAbaNaUrl(ABAS);
  const [configurando, setConfigurando] = useState(false);

  const sugestoes = useSugestoesQuery();
  const cobertura = useCoberturaQuery();
  const ociosos = useOciososQuery(30);
  const configuracao = useConfiguracaoDaDescobertaQuery();
  const semVinculo = useEndpointsQuery('sem');
  const vinculadas = useEndpointsQuery('com');

  const aceitar = useAceitarSugestao();
  const recusar = useRecusarSugestao();
  const triar = useTriarMaquina();
  const vincular = useVincularMaquina();
  const vincularEEntregar = useVincularEEntregar();
  const desvincular = useDesvincularMaquina();
  const salvarConfiguracao = useSalvarConfiguracaoDaDescoberta();

  // RECONCILIAR AGORA: só `SUPERVISOR` vê o botão (a rota recusa os outros com 403;
  // aqui é interface, não segurança).
  const reconciliar = useReconciliarAgora();
  const podeReconciliar = usePode('SUPERVISOR');

  /**
   * O erro vai para a TELA, e não para o console.
   *
   * As recusas do servidor aqui são explicações, não falhas: "esta máquina já
   * está vinculada a outro ativo" é exatamente o que quem clicou precisa ler.
   * Engolir a mensagem deixaria o botão parecendo quebrado.
   */
  const comErro = async (operacao: () => Promise<unknown>) => {
    notificar.limpar();
    try {
      await operacao();
    } catch (falha) {
      // `ErroDaApi` já traz a frase do servidor no `message` (`apiClient.ts`).
      notificar.erro((falha as Error).message || 'Não foi possível concluir a operação.');
    }
  };

  return {
    aba, setAba,

    sugestoes: sugestoes.data?.rows ?? [],
    // Sem resposta não há número: `undefined`, e a aba fica sem contagem.
    contagem: {
      fila: sugestoes.data?.rows.length,
      sem: semVinculo.data?.length,
      com: vinculadas.data?.length,
      ociosos: ociosos.data?.rows.length,
    } as Record<AbaDaTela, number | undefined>,
    carregandoSugestoes: sugestoes.isLoading,
    erroDasSugestoes: sugestoes.error?.message ?? null,
    cobertura: cobertura.data,
    carregandoCobertura: cobertura.isLoading,
    erroDaCobertura: cobertura.error?.message ?? null,
    ociosos: ociosos.data?.rows ?? [],
    carregandoOciosos: ociosos.isLoading,
    erroDosOciosos: ociosos.error?.message ?? null,
    configuracao: configuracao.data,
    erroDaConfiguracao: configuracao.error?.message ?? null,

    semVinculo: semVinculo.data ?? [],
    vinculadas: vinculadas.data ?? [],
    carregandoMaquinas: semVinculo.isLoading || vinculadas.isLoading,
    erroDasMaquinas: semVinculo.error?.message ?? vinculadas.error?.message ?? null,

    ocupado: aceitar.isPending || recusar.isPending || triar.isPending
      || vincular.isPending || vincularEEntregar.isPending || desvincular.isPending || reconciliar.isPending,

    podeReconciliar,
    reconciliando: reconciliar.isPending,
    handleReconciliar: () => void comErro(async () => {
      notificar.info(placarDaVarredura(await reconciliar.mutateAsync()));
    }),

    handleAceitar: (id: string) => void comErro(async () => {
      await aceitar.mutateAsync(id);
      notificar.sucesso('Sugestão aceita.');
    }),
    handleRecusar: (id: string) => void comErro(async () => {
      await recusar.mutateAsync(id);
      notificar.sucesso('Sugestão recusada.');
    }),
    handleTriar: (id: string, reviewState: Exclude<ReviewState, 'UNREVIEWED'>) => void comErro(async () => {
      await triar.mutateAsync({ id, reviewState });
      notificar.sucesso(TRIAGEM_SALVA[reviewState]);
    }),

    /**
     * VINCULAR À MÃO, e opcionalmente ENTREGAR ao posto na mesma ida.
     *
     * PROPAGA em vez de passar pelo `comErro`: é no painel do formulário que a
     * recusa precisa aparecer — "este posto já tem um computador", ou "a máquina
     * foi vinculada, mas a entrega não aconteceu". A notificação cairia em cima
     * do botão do painel.
     */
    handleVincular: async (endpointId: string, assetId: string, targetWorkstationId: string | null) => {
      if (targetWorkstationId) {
        await vincularEEntregar.mutateAsync({ endpointId, assetId, targetWorkstationId });
      } else {
        await vincular.mutateAsync({ endpointId, assetId });
      }
    },

    /**
     * DESVINCULAR é a correção de um vínculo errado — o pior resultado possível, e
     * não pode depender de mexer no banco à mão. Tem volta, então pergunta sem
     * vermelho.
     */
    handleDesvincular: async (maquina: Endpoint) => {
      if (!(await confirmar({
        titulo: `Desvincular esta máquina de "${maquina.asset?.assetTag}"?`,
        descricao: 'O computador deixa de mostrar esta máquina, que volta para Sem vínculo e pode ser vinculada de novo.',
        acao: 'Desvincular',
      }))) return;

      await comErro(async () => {
        await desvincular.mutateAsync(maquina.id);
        notificar.sucesso('Máquina desvinculada.');
      });
    },

    // CONFIGURAR (`PUT /api/settings/discovery`) também é `SUPERVISOR`, e abre o painel
    // lateral, como todo formulário. Propaga como o vincular: a recusa fica no painel.
    configurando,
    abrirConfiguracao: () => setConfigurando(true),
    fecharConfiguracao: () => setConfigurando(false),
    handleSalvarConfiguracao: async (dados: ConfiguracaoDaDescoberta) => {
      await salvarConfiguracao.mutateAsync(dados);
    },
  };
}

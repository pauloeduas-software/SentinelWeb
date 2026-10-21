import { useState } from 'react';
import {
  useAceitarSugestao, useCoberturaQuery, useConfiguracaoDaDescobertaQuery,
  useOciososQuery, useReconciliarAgora, useRecusarSugestao, useSalvarConfiguracaoDaDescoberta,
  useSugestoesQuery, useTriarMaquina, useVincularEEntregar, useVincularMaquina,
} from '../../../domain/reconciliation/reconciliation.queries';
import { useEndpointsQuery } from '../../../domain/endpoint/endpoint.queries';
import { usePode } from '../../../domain/auth/auth.store';
import type {
  ConfiguracaoDaDescoberta, ResultadoDaVarredura, ReviewState,
} from '../../../domain/shared/reconciliation.types';

// O ESTADO DA TELA DE DESCOBERTAS. A página é markup e mais nada
// (docs/referencia/arquitetura.md).

/**
 * As quatro abas. `sem` e `com` são as DUAS LISTAS de máquinas — o que o agente
 * vê e o cadastro não sabe, e o que já é patrimônio —, e são o recorte do
 * servidor (`?vinculo=`), não um `filter` sobre a frota inteira.
 */
export type AbaDaTela = 'fila' | 'sem' | 'com' | 'ociosos';

export function useDescobertas() {
  const [aba, setAba] = useState<AbaDaTela>('fila');
  const [erro, setErro] = useState<string | null>(null);

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
  const salvarConfiguracao = useSalvarConfiguracaoDaDescoberta();

  // RECONCILIAR AGORA: só `ADMIN` vê o botão (a rota recusa os outros com 403;
  // aqui é interface, não segurança). O placar da última rodada fica na tela
  // ao lado do botão — "3 sugestões, 1 vínculo" é a resposta à pergunta de
  // quem clicou, e um `alert` a faria sumir no fechar.
  const reconciliar = useReconciliarAgora();
  const podeReconciliar = usePode('ADMIN');
  const [ultimaVarredura, setUltimaVarredura] = useState<ResultadoDaVarredura | null>(null);

  /**
   * O erro vai para a TELA, e não para o console.
   *
   * As recusas do servidor aqui são explicações, não falhas: "esta máquina já
   * está vinculada a outro ativo" é exatamente o que quem clicou precisa ler.
   * Engolir a mensagem deixaria o botão parecendo quebrado.
   */
  const comErro = async (operacao: () => Promise<unknown>) => {
    setErro(null);
    try {
      await operacao();
    } catch (falha) {
      // `ErroDaApi` já traz a frase do servidor no `message` (`apiClient.ts`).
      setErro((falha as Error).message || 'Não foi possível concluir a operação.');
    }
  };

  return {
    aba, setAba,
    erro, limparErro: () => setErro(null),

    sugestoes: sugestoes.data?.rows ?? [],
    carregandoSugestoes: sugestoes.isLoading,
    cobertura: cobertura.data,
    carregandoCobertura: cobertura.isLoading,
    ociosos: ociosos.data?.rows ?? [],
    configuracao: configuracao.data,

    semVinculo: semVinculo.data ?? [],
    vinculadas: vinculadas.data ?? [],
    carregandoMaquinas: semVinculo.isLoading || vinculadas.isLoading,

    ocupado: aceitar.isPending || recusar.isPending || triar.isPending
      || vincular.isPending || vincularEEntregar.isPending || reconciliar.isPending,

    podeReconciliar,
    // Mudar o modo e os prazos (`PUT /api/settings/discovery`) também é `ADMIN`.
    // Mesmo cargo do reconciliar, nome próprio para quem lê a página não ter
    // que saber disso.
    podeConfigurar: podeReconciliar,
    reconciliando: reconciliar.isPending,
    ultimaVarredura,
    handleReconciliar: () => void comErro(async () => {
      setUltimaVarredura(await reconciliar.mutateAsync());
    }),

    handleAceitar: (id: string) => void comErro(() => aceitar.mutateAsync(id)),
    handleRecusar: (id: string) => void comErro(() => recusar.mutateAsync(id)),
    handleTriar: (id: string, reviewState: ReviewState) =>
      void comErro(() => triar.mutateAsync({ id, reviewState })),

    /**
     * VINCULAR À MÃO, e opcionalmente ENTREGAR ao posto na mesma ida.
     *
     * PROPAGA em vez de passar pelo `comErro`: o formulário é inline, na linha
     * da máquina, e é lá que a recusa precisa aparecer — "este posto já tem um
     * computador", ou "a máquina foi vinculada, mas a entrega não aconteceu".
     * A faixa de erro no topo da tela ficaria longe de quem clicou.
     */
    handleVincular: async (endpointId: string, assetId: string, targetWorkstationId: string | null) => {
      if (targetWorkstationId) {
        await vincularEEntregar.mutateAsync({ endpointId, assetId, targetWorkstationId });
      } else {
        await vincular.mutateAsync({ endpointId, assetId });
      }
    },

    /**
     * Salva um pedaço da configuração — e o corpo é PARCIAL de propósito.
     *
     * A rota é `PUT` com todos os campos opcionais, então a tela pode mandar só
     * o que mexeu. Obrigá-la a mandar os três para trocar um seria pedir ao
     * cliente que conhecesse os outros dois — e a primeira vez que alguém
     * abrisse a tela com um cache velho, salvar o modo reverteria os limiares.
     */
    salvandoConfiguracao: salvarConfiguracao.isPending,
    handleSalvarConfiguracao: (dados: Partial<ConfiguracaoDaDescoberta>) =>
      void comErro(() => salvarConfiguracao.mutateAsync(dados)),
  };
}

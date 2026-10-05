import { useState } from 'react';
import { useWorkstationsQuery } from '../../../domain/workstation/workstation.queries';
import {
  useAceitarSugestao, useCoberturaQuery, useConfiguracaoDaDescobertaQuery,
  useOciososQuery, useRecusarSugestao, useSalvarConfiguracaoDaDescoberta,
  useSugestoesQuery, useTriarMaquina,
} from '../../../domain/reconciliation/reconciliation.queries';
import { useEndpointsQuery } from '../../../domain/endpoint/endpoint.queries';
import type {
  ConfiguracaoDaDescoberta, ReviewState, SuggestionKind,
} from '../../../domain/shared/reconciliation.types';

// O ESTADO DA TELA DE DESCOBERTAS. A página é markup e mais nada
// (docs/referencia/arquitetura.md).

export type AbaDaTela = 'fila' | 'orfaos' | 'ociosos';

export function useDescobertas() {
  const [aba, setAba] = useState<AbaDaTela>('fila');
  const [filtro, setFiltro] = useState<SuggestionKind | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);

  const sugestoes = useSugestoesQuery(filtro);
  const cobertura = useCoberturaQuery();
  const ociosos = useOciososQuery(30);
  const configuracao = useConfiguracaoDaDescobertaQuery();
  const endpoints = useEndpointsQuery();

  // ── SÓ OS POSTOS DE TRABALHO, e agora de verdade ──────────────────────────
  //
  // Isto chamava `useCatalogOptionsQuery('locations')` com um comentário dizendo
  // exatamente o que o código NÃO fazia: `/api/locations/options` devolve TODAS
  // as localizações, de propósito e documentado (`catalog/specs/location.spec.ts`
  // — "o pai de uma mesa é uma sala, e uma sala não é posto"). O seletor do
  // `SHARED_POST` oferecia a filial e o andar ao lado da Mesa 1.
  //
  // E o estrago passava: nem o aceite nem o `checkoutAsset` checam
  // `isWorkstation`, então escolher "Matriz — São Paulo" criava uma posse de
  // POSTO apontando para uma localização que não é posto. A `Assignment` fica
  // válida, a tela de /postos nunca mostra aquele ativo, e o `postoVago` — que é
  // o sinal de "ninguém responde por este equipamento" — não tem como falar dele.
  //
  // A própria spec de localizações aponta o caminho certo: `GET /api/workstations`,
  // que filtra no domínio que é dono do corte. `perPage: 100` é o teto do
  // `list-query`, e um seletor é o lugar onde esse teto é aceitável — passando
  // de cem postos, a escolha é por busca, não por rolar uma lista.
  const postos = useWorkstationsQuery({ perPage: 100 });

  const aceitar = useAceitarSugestao();
  const recusar = useRecusarSugestao();
  const triar = useTriarMaquina();
  const salvarConfiguracao = useSalvarConfiguracaoDaDescoberta();

  /**
   * O erro vai para a TELA, e não para o console.
   *
   * As recusas do servidor aqui são explicações, não falhas: "este ativo passou
   * a ser de um posto e aceitar desfaria a posse do posto" é exatamente o que
   * quem clicou precisa ler (D47). Engolir a mensagem deixaria o botão
   * parecendo quebrado.
   */
  const comErro = async (operacao: () => Promise<unknown>) => {
    setErro(null);
    try {
      await operacao();
    } catch (falha) {
      const resposta = (falha as { response?: { data?: { error?: string } } }).response;
      setErro(resposta?.data?.error ?? 'Não foi possível concluir a operação.');
    }
  };

  return {
    aba, setAba,
    filtro, setFiltro,
    erro, limparErro: () => setErro(null),

    sugestoes: sugestoes.data?.rows ?? [],
    carregandoSugestoes: sugestoes.isLoading,
    cobertura: cobertura.data,
    carregandoCobertura: cobertura.isLoading,
    ociosos: ociosos.data?.rows ?? [],
    configuracao: configuracao.data,
    // Só `{id, name}` para fora: o card da sugestão precisa de um seletor, não
    // do detalhe do posto (ocupantes, contagem de ativos, `vago`).
    postos: (postos.data?.rows ?? []).map((posto) => ({ id: posto.id, name: posto.name })),

    // Os órfãos saem da MESMA consulta que o painel de telemetria usa: máquina
    // sem `assetId` é a definição de órfão, e uma rota nova só para filtrar o
    // que já está em memória seria uma segunda fonte para o mesmo fato.
    orfaos: (endpoints.data ?? []).filter((endpoint) => !endpoint.assetId),

    ocupado: aceitar.isPending || recusar.isPending || triar.isPending,

    handleAceitar: (id: string, extra?: { locationId?: string }) =>
      void comErro(() => aceitar.mutateAsync({ id, extra })),
    handleRecusar: (id: string) => void comErro(() => recusar.mutateAsync(id)),
    handleTriar: (id: string, reviewState: ReviewState) =>
      void comErro(() => triar.mutateAsync({ id, reviewState })),

    /**
     * Salva um pedaço da configuração — e o corpo é PARCIAL de propósito.
     *
     * A rota é `PUT` com todos os campos opcionais, então a tela pode mandar só
     * o que mexeu. Obrigá-la a mandar os cinco para trocar um seria pedir ao
     * cliente que conhecesse os outros quatro — e a primeira vez que alguém
     * abrisse a tela com um cache velho, salvar o modo reverteria a allowlist.
     */
    salvandoConfiguracao: salvarConfiguracao.isPending,
    handleSalvarConfiguracao: (dados: Partial<ConfiguracaoDaDescoberta>) =>
      void comErro(() => salvarConfiguracao.mutateAsync(dados)),
  };
}

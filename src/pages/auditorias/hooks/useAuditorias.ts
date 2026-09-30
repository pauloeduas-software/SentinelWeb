import { useMemo, useState } from 'react';
import { useAuditarPosto, useConferenciaDoPostoQuery } from '../../../domain/audit/audit.queries';
import { useWorkstationsQuery } from '../../../domain/workstation/workstation.queries';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const PER_PAGE = 20;

/**
 * O ESTADO DA CONFERÊNCIA — e ele é o conjunto dos ativos MARCADOS COMO
 * PRESENTES, não um mapa de resultados.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * A TELA NÃO ESCOLHE `OK` NEM `DIVERGENTE`. ELA SÓ SABE QUEM ESTAVA LÁ.
 *
 * A diferença entre os dois depende de onde o ativo ESTAVA antes — informação do
 * servidor, que muda enquanto a conferência acontece. Se a tela traduzisse o
 * gesto ("estava na mesa") em resultado, ela estaria adivinhando com dado velho:
 * a linha foi carregada há cinco minutos e outra pessoa pode ter movido o ativo.
 *
 * Então o que sobe são dois conjuntos de ids, e quem deduz é o use-case (D52/D54).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export function useAuditorias() {
  const [busca, setBusca] = useState('');
  const [page, setPage] = useState(1);
  const buscaDebounced = useDebouncedValue(busca);

  const [postoId, setPostoId] = useState<string | null>(null);
  const [presentes, setPresentes] = useState<Set<string>>(new Set());
  const [notas, setNotas] = useState('');
  const [resultado, setResultado] = useState<string | null>(null);

  const params = useMemo(
    () => ({ page, perPage: PER_PAGE, q: buscaDebounced || undefined }),
    [page, buscaDebounced],
  );

  const { data: postos, isPending: postosPendentes } = useWorkstationsQuery(params);
  const { data: conferencia, isPending: conferenciaPendente } = useConferenciaDoPostoQuery(postoId);
  const auditar = useAuditarPosto();

  const changeBusca = (valor: string) => {
    setBusca(valor);
    setPage(1);
  };

  /**
   * Trocar de posto ZERA a marcação, e isso não é detalhe.
   *
   * Sem zerar, os ids marcados na Mesa 1 viajariam para a Mesa 2 e seriam
   * enviados como "encontrados na Mesa 2" — a conferência moveria ativos para um
   * posto onde ninguém os viu, com `DIVERGENTE` e tudo, e o registro pareceria
   * legítimo.
   */
  const escolherPosto = (id: string) => {
    setPostoId(id);
    setPresentes(new Set());
    setNotas('');
    setResultado(null);
  };

  const alternar = (assetId: string) => {
    setPresentes((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(assetId)) proximo.delete(assetId);
      else proximo.add(assetId);
      return proximo;
    });
  };

  /** Todos os ativos que a tela conhece deste posto — as duas listas, sem repetir. */
  const idsVisiveis = useMemo(() => {
    if (!conferencia) return [] as string[];
    return [...new Set([
      ...conferencia.doPosto.map((item) => item.asset.id),
      ...conferencia.noPosto.map((item) => item.asset.id),
    ])];
  }, [conferencia]);

  const marcarTodos = () => setPresentes(new Set(idsVisiveis));
  const desmarcarTodos = () => setPresentes(new Set());

  const handleConferir = async () => {
    if (!postoId || idsVisiveis.length === 0) return;

    // O QUE NÃO FOI MARCADO É "NÃO LOCALIZADO" — e só entre os que a tela mostrou.
    // Enviar a frota inteira como não localizada seria o efeito de calcular isso
    // sobre qualquer outra lista.
    const naoLocalizados = idsVisiveis.filter((id) => !presentes.has(id));

    try {
      const resposta = await auditar.mutateAsync({
        locationId: postoId,
        data: {
          encontrados: [...presentes],
          naoLocalizados,
          notes: notas.trim() || null,
        },
      });

      setResultado(
        `${resposta.auditorias.length} ativo(s) conferido(s)`
        + (resposta.divergentes > 0 ? ` · ${resposta.divergentes} movido(s) para este posto` : '')
        + (resposta.naoLocalizados > 0 ? ` · ${resposta.naoLocalizados} não localizado(s)` : ''),
      );
      setPresentes(new Set());
      setNotas('');
    } catch (erro) {
      // O 422 de conferência vazia e o 404 de posto apagado enquanto a tela estava
      // aberta aparecem aqui, com a frase do servidor.
      alert((erro as Error).message);
    }
  };

  return {
    postos: postos?.rows ?? [],
    totalDePostos: postos?.total ?? 0,
    postosPendentes,
    page,
    perPage: PER_PAGE,
    setPage,
    busca,
    changeBusca,

    postoId,
    escolherPosto,
    conferencia,
    conferenciaPendente,

    presentes,
    alternar,
    marcarTodos,
    desmarcarTodos,
    idsVisiveis,

    notas,
    setNotas,
    conferindo: auditar.isPending,
    resultado,
    handleConferir,
  };
}

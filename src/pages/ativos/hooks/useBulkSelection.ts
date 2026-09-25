import { useCallback, useMemo, useState } from 'react';

// A SELEÇÃO da listagem — estado de UMA tela, em `useState`
// (docs/ARQUITETURA.md). Nada aqui fala com o servidor: quem envia o lote é o
// hook da página; aqui só se decide o que está marcado.
//
// `Set`, e não array: marcar e desmarcar é a operação mais frequente da tela e
// o `includes` de um array com 200 ids roda a cada linha, a cada render.

/**
 * A seleção ATRAVESSA a paginação de propósito.
 *
 * Marcar cinco na página 1, virar a página e marcar mais três é o caminho
 * normal de quem está montando um lote. Limpar ao paginar faria a tela desfazer
 * em silêncio um trabalho que o operador não desfez — e "selecionar todos" já
 * existe para o caso de querer a página inteira.
 *
 * Quem troca de vista ou de filtro chama `limpar()`: ali a lista passa a ser
 * outra, e uma seleção invisível é seleção esquecida.
 */
export function useBulkSelection(idsDaPagina: string[]) {
  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(() => new Set());

  const alternar = useCallback((id: string) => {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (!proximo.delete(id)) proximo.add(id);
      return proximo;
    });
  }, []);

  const limpar = useCallback(() => setSelecionados(new Set()), []);

  // Cálculo fora do JSX: o cabeçalho precisa saber se a PÁGINA está inteira
  // marcada, que não é o mesmo que "há algo marcado" — a seleção pode vir de
  // outra página.
  const paginaInteiraMarcada = useMemo(
    () => idsDaPagina.length > 0 && idsDaPagina.every((id) => selecionados.has(id)),
    [idsDaPagina, selecionados],
  );

  const alternarPagina = useCallback(() => {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      const marcarTudo = !idsDaPagina.every((id) => proximo.has(id));

      for (const id of idsDaPagina) {
        if (marcarTudo) proximo.add(id);
        else proximo.delete(id);
      }
      return proximo;
    });
  }, [idsDaPagina]);

  return {
    /** Array para o corpo da requisição; a leitura da tela usa `estaMarcado`. */
    ids: useMemo(() => [...selecionados], [selecionados]),
    quantos: selecionados.size,
    estaMarcado: useCallback((id: string) => selecionados.has(id), [selecionados]),
    paginaInteiraMarcada,
    alternar,
    alternarPagina,
    limpar,
  };
}

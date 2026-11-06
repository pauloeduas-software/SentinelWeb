import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from './useDebouncedValue';

/** Quantas linhas por página, em toda lista e em toda janela (BB). */
export const POR_PAGINA = 15;

/** A marca das trocas feitas pela própria lista: o resto veio de fora (`useListaNaUrl`). */
const DA_LISTA = { daLista: true };

/** `?pagina=` da lista: conta de 1, e o que não é página vale a primeira. */
function paginaDaUrl(valor: string | null): number {
  const pagina = Number(valor);
  return Number.isInteger(pagina) && pagina > 0 ? pagina : 1;
}

// OS FILTROS DE TODA LISTA MORAM NA URL (BB): `?pagina=2&busca=mesa&categoria=x`. Quem
// abre um registro em outra página e volta encontra a lista como deixou, o F5 não
// zera, e o link leva ao mesmo recorte.
export function useListaNaUrl() {
  const [parametros, setParametros] = useSearchParams();
  const { key, state } = useLocation();
  const page = paginaDaUrl(parametros.get('pagina'));

  // A BUSCA É LIDA DA URL AO ABRIR. O router troca a URL numa transição, e um campo
  // controlado por ela perderia letra de quem digita rápido.
  const [search, setSearch] = useState(parametros.get('busca') ?? '');
  const debouncedSearch = useDebouncedValue(search);

  // A URL TAMBÉM MUDA POR FORA: o link do menu, que limpa a lista. Sem a marca, o campo
  // acompanha a URL. Durante o render, e não num `useEffect`: `setState` dentro de efeito
  // encadeia renders e o lint do react-hooks recusa.
  const [ultimaChave, setUltimaChave] = useState(key);
  if (key !== ultimaChave) {
    setUltimaChave(key);
    if (!(state as typeof DA_LISTA | null)?.daLista) setSearch(parametros.get('busca') ?? '');
  }

  // `replace`: o voltar do navegador sai da lista, em vez de desfazer filtro por filtro.
  //
  // A BASE É A URL DE AGORA. O `setParametros((atuais) => ...)` entrega a do último
  // render, e a segunda troca antes de a lista desenhar de novo desfaria a primeira.
  const trocar = (novos: Record<string, string | undefined>) => {
    const atuais = new URLSearchParams(window.location.search);
    Object.entries(novos).forEach(([nome, valor]) => {
      if (valor) atuais.set(nome, valor);
      else atuais.delete(nome);
    });
    setParametros(atuais, { replace: true, state: DA_LISTA });
  };

  /** Outra lista na mesma tela: a aba trocou, e tudo o que era da anterior fica para trás. */
  const recomecar = (novos: Record<string, string>) => setParametros(novos, { replace: true });

  const setPage = (pagina: number) => trocar({ pagina: pagina > 1 ? String(pagina) : undefined });

  const changeSearch = (valor: string) => {
    setSearch(valor);
    trocar({ busca: valor, pagina: undefined });
  };

  /** Troca um filtro: resultado novo começa sempre da primeira página. */
  const filtrar = (nome: string, valor: string | undefined) => trocar({ [nome]: valor, pagina: undefined });

  return {
    parametros, page, perPage: POR_PAGINA, setPage, search, debouncedSearch, changeSearch, filtrar, trocar, recomecar,
  };
}

/**
 * A página que deixou de existir volta para a última: a linha saiu da lista por
 * exclusão, aqui ou por outra pessoa, ou a URL guardada ficou velha. Sem esperar a
 * consulta (`total` indefinido), a primeira carga mandaria toda lista para a página 1.
 */
export function usePaginaQueExiste(page: number, total: number | undefined, setPage: (pagina: number) => void) {
  const ultima = total === undefined ? page : Math.max(1, Math.ceil(total / POR_PAGINA));
  useEffect(() => {
    if (page > ultima) setPage(ultima);
  });
}

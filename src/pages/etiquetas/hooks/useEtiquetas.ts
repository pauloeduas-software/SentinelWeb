import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useBaixarFolha, useLabelLayoutQuery, usePreviaDeEtiquetas, useResolverEtiquetas, useSalvarLayout,
} from '../../../domain/label/label.queries';
import type { LayoutDeEtiqueta } from '../../../domain/shared/label.types';

/** O debounce da prévia. Cada render do PDF gera N imagens no servidor. */
const DEBOUNCE_MS = 600;

// O ESTADO DA TELA DE ETIQUETAS (F10, Etapa G).
//
// A PRÉVIA É DEBOUNCED, e a razão é o custo: cada chamada renderiza um PDF com
// um QR e um Code128 por etiqueta, gerados em processo. Sem debounce, arrastar
// o campo de margem dispararia uma renderização por tecla — e o teto de 10/min
// da rota (o mesmo do export) cortaria o ajuste no meio.
//
// O LAYOUT EDITADO E O LAYOUT SALVO SÃO COISAS DIFERENTES: a prévia desenha o
// EDITADO (é para isso que ela existe), e "salvar" grava o que vale como padrão
// da próxima vez. Sem a distinção, a tela só mostraria o efeito de um ajuste
// depois de salvá-lo — e o objetivo declarado é não gastar a folha descobrindo.
export function useEtiquetas() {
  const consulta = useLabelLayoutQuery();
  const salvar = useSalvarLayout();
  const previa = usePreviaDeEtiquetas();
  const baixar = useBaixarFolha();
  const resolver = useResolverEtiquetas();

  const [layout, setLayout] = useState<LayoutDeEtiqueta | null>(null);
  const [urlDaPrevia, setUrlDaPrevia] = useState<string | null>(null);
  const [bipados, setBipados] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // O layout salvo semeia o editado UMA vez, quando a consulta responde.
  // `useEffect` com guarda, e não estado inicial preguiçoso: aqui o dado chega
  // depois do primeiro render e a tela não remonta (ela não é um formulário em
  // modal, é a página inteira).
  useEffect(() => {
    if (consulta.data && layout === null) setLayout(consulta.data.layout);
  }, [consulta.data, layout]);

  // `useMemo` nos DOIS: `?? []` cria um array novo a cada render, e ele é
  // dependência do efeito da prévia — sem isto, a prévia se redispararia para
  // sempre, uma renderização de PDF por render da tela.
  const ativos = useMemo(() => resolver.data?.encontrados ?? [], [resolver.data]);
  const assetIds = useMemo(() => ativos.map((ativo) => ativo.id), [ativos]);

  // A PRÉVIA, com debounce, sempre que o layout ou a seleção mudam.
  useEffect(() => {
    if (!layout || assetIds.length === 0) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      previa.mutate({ assetIds, layout }, {
        onSuccess: (url) => {
          // Revoga a anterior: sem isto, cada ajuste do formulário deixaria um
          // PDF na memória da aba até ela fechar.
          setUrlDaPrevia((anterior) => {
            if (anterior) URL.revokeObjectURL(anterior);
            return url;
          });
        },
      });
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `previa` fora das dependências de propósito: a identidade da mutação muda
    // a cada render e o efeito entraria em laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, assetIds]);

  const alterar = <Campo extends keyof LayoutDeEtiqueta>(
    campo: Campo,
    valor: LayoutDeEtiqueta[Campo],
  ) => {
    setLayout((atual) => (atual ? { ...atual, [campo]: valor } : atual));
  };

  const alternarCampo = (token: string) => {
    setLayout((atual) => {
      if (!atual) return atual;

      const fields = atual.fields.includes(token)
        ? atual.fields.filter((item) => item !== token)
        : [...atual.fields, token];

      return { ...atual, fields };
    });
  };

  return {
    layout,
    campos: consulta.data?.campos ?? [],
    tamanhos: consulta.data?.tamanhos ?? [],
    /** A medida do SALVO; a do editado vem do servidor junto com a prévia. */
    medida: consulta.data?.medida,
    carregando: consulta.isPending,

    alterar,
    alternarCampo,
    salvando: salvar.isPending,
    erroAoSalvar: salvar.error?.message ?? null,
    handleSalvar: () => { if (layout) salvar.mutate(layout); },

    bipados,
    setBipados,
    resolvendo: resolver.isPending,
    ativos,
    naoEncontrados: resolver.data?.naoEncontrados ?? [],
    handleResolver: () => {
      const termos = bipados.split(/[\n,;\t]/).map((termo) => termo.trim()).filter(Boolean);
      if (termos.length > 0) resolver.mutate(termos);
    },

    urlDaPrevia,
    gerandoPrevia: previa.isPending,
    erroDaPrevia: previa.error?.message ?? null,

    baixando: baixar.isPending,
    handleBaixar: () => {
      if (layout && assetIds.length > 0) baixar.mutate({ assetIds, layout });
    },
  };
}

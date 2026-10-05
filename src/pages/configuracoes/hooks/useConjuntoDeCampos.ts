import { useMemo, useState } from 'react';
import {
  useComposicaoQuery, useSalvarComposicao,
} from '../../../domain/custom-field/custom-field.queries';
import { useCatalogOptionsQuery } from '../../../domain/catalog/catalog.queries';
import type {
  ComposicaoDoConjunto, VinculoDoConjunto,
} from '../../../domain/shared/custom-field.types';

// Estado da COMPOSIÇÃO de um conjunto de campos (F9, D61/D64).
//
// ═════════════════════════════════════════════════════════════════════════════
// A LISTA É EDITADA EM MEMÓRIA E GRAVADA DE UMA VEZ.
//
// É a única tela do projeto com rascunho local de uma lista, e a razão é a
// operação: reordenar é uma sequência de movimentos, e gravar cada um seria uma
// requisição por arrastar — com estados intermediários que o servidor recusaria
// (ordem duplicada no meio do caminho) e um `undo` impossível.
//
// O servidor substitui a composição INTEIRA num `PUT`
// (`set-fieldset-fields.usecase.ts`), então o rascunho aqui e a gravação lá
// falam a mesma língua: uma lista, na ordem final.
// ═════════════════════════════════════════════════════════════════════════════

/** A linha em edição: o que veio do servidor, mais o que a tela mudou. */
export type RascunhoDeVinculo = Pick<
  VinculoDoConjunto,
  'fieldId' | 'slug' | 'name' | 'element' | 'encrypted' | 'required' | 'defaultValue' | 'quebrariam'
>;

export function useConjuntoDeCampos(fieldsetId: string | null) {
  const { data: composicao, isPending } = useComposicaoQuery(fieldsetId);
  const salvar = useSalvarComposicao(fieldsetId ?? '');

  // Os campos que existem, para o `<select>` de "acrescentar". O `/options` do
  // catálogo devolve id e nome, que é tudo que o seletor precisa.
  const { data: catalogoDeCampos } = useCatalogOptionsQuery('custom-fields');

  const [rascunho, setRascunho] = useState<RascunhoDeVinculo[]>([]);
  const [erro, setErro] = useState('');
  /** A resposta que semeou o rascunho atual. É ela que detecta "chegou outra". */
  const [base, setBase] = useState<ComposicaoDoConjunto | null>(null);

  // ── O RASCUNHO NASCE DA RESPOSTA, AJUSTADO DURANTE O RENDER ─────────────
  //
  // ═════════════════════════════════════════════════════════════════════════
  // E NÃO num `useEffect`, que é o que parecia natural e que o lint recusa
  // (`react-hooks/set-state-in-effect`) — com razão: `setState` dentro de efeito
  // encadeia um render a mais DEPOIS de a tela já ter pintado, então a lista
  // apareceria vazia por um quadro antes de preencher.
  //
  // Ajustar durante o render é o padrão que o React documenta para semear estado
  // local a partir de dado externo. Ele converge porque a condição compara a
  // IDENTIDADE do objeto do cache do TanStack Query: `composicao` só é outro
  // objeto quando a consulta refez, e o `setBase` da mesma passada faz a
  // condição parar de valer.
  //
  // O que isto compra, além do quadro: um `invalidate` disparado por outra tela
  // traz um objeto novo e REINICIA o rascunho — perdendo a edição em andamento —,
  // e isso é o certo aqui. A alternativa era mesclar o que veio com o que está
  // sendo editado, e mesclar composição de lista sem saber qual lado é o mais
  // recente é como se inventam divergências.
  // ═════════════════════════════════════════════════════════════════════════
  if (composicao && composicao !== base) {
    setBase(composicao);
    setRascunho(composicao.fields.map((vinculo) => ({ ...vinculo })));
    setErro('');
  }

  /** Os campos do catálogo que ainda NÃO estão no conjunto. */
  const disponiveis = useMemo(() => {
    const noConjunto = new Set(rascunho.map((vinculo) => vinculo.fieldId));
    return (catalogoDeCampos ?? []).filter((campo) => !noConjunto.has(campo.id));
  }, [catalogoDeCampos, rascunho]);

  /** Mudou algo em relação ao que está gravado? É o que habilita o botão. */
  const sujo = useMemo(() => {
    if (!base) return false;
    if (base.fields.length !== rascunho.length) return true;

    return base.fields.some((gravado, indice) => {
      const local = rascunho[indice];
      return local === undefined
        || local.fieldId !== gravado.fieldId
        || local.required !== gravado.required
        || local.defaultValue !== gravado.defaultValue;
    });
  }, [base, rascunho]);

  const acrescentar = (fieldId: string) => {
    const campo = (catalogoDeCampos ?? []).find((opcao) => opcao.id === fieldId);
    if (!campo) return;

    // O campo entra com o que a tela AINDA NÃO SABE dele — elemento, cifra — em
    // valores neutros: o `/options` do catálogo devolve só id e nome. Depois de
    // gravar, a releitura da composição traz o resto.
    //
    // Ele nasce OPCIONAL de propósito, e é o caminho do D61: campo novo
    // obrigatório num conjunto já em uso travaria a edição de todo ativo antigo
    // no mesmo instante. Nasce opcional, a edição em massa faz o backfill, e só
    // então se promove — com o contador à vista.
    setRascunho((atual) => [...atual, {
      fieldId: campo.id,
      slug: '',
      name: campo.name,
      element: 'TEXT',
      encrypted: false,
      required: false,
      defaultValue: null,
      quebrariam: 0,
    }]);
  };

  const remover = (fieldId: string) =>
    setRascunho((atual) => atual.filter((vinculo) => vinculo.fieldId !== fieldId));

  const alternarObrigatorio = (fieldId: string) =>
    setRascunho((atual) => atual.map((vinculo) => (
      vinculo.fieldId === fieldId ? { ...vinculo, required: !vinculo.required } : vinculo
    )));

  const definirPadrao = (fieldId: string, valor: string) =>
    setRascunho((atual) => atual.map((vinculo) => (
      // `''` vira `null`: "padrão vazio" e "sem padrão" são a mesma coisa, e é
      // assim que o schema do servidor o lê.
      vinculo.fieldId === fieldId ? { ...vinculo, defaultValue: valor || null } : vinculo
    )));

  /**
   * Move um campo de posição.
   *
   * ÍNDICE E NÃO `fieldId`: o arrastar-e-soltar entrega posição de origem e de
   * destino, e é a posição que define a ordem gravada. Trabalhar por id exigiria
   * procurar os dois no array a cada movimento.
   */
  const mover = (de: number, para: number) =>
    setRascunho((atual) => {
      if (de === para || de < 0 || para < 0 || de >= atual.length || para >= atual.length) return atual;
      const copia = [...atual];
      const [movido] = copia.splice(de, 1);
      copia.splice(para, 0, movido);
      return copia;
    });

  const descartar = () => {
    if (base) setRascunho(base.fields.map((vinculo) => ({ ...vinculo })));
    setErro('');
  };

  /**
   * Grava. O erro NÃO sobe: ele é mostrado dentro do modal.
   *
   * É a exceção à regra de "mutação propaga" (docs/referencia/arquitetura.md), e o motivo é
   * o rascunho: propagando, o modal fecharia com a edição perdida, e o 422 do
   * valor padrão inválido — que é o erro mais provável aqui — apareceria num
   * `alert` sem a lista para corrigir.
   */
  const gravar = async () => {
    setErro('');
    try {
      await salvar.mutateAsync({
        fields: rascunho.map((vinculo) => ({
          fieldId: vinculo.fieldId,
          required: vinculo.required,
          defaultValue: vinculo.defaultValue,
        })),
      });
    } catch (falha) {
      setErro((falha as Error).message);
    }
  };

  return {
    nome: composicao?.name ?? '',
    modelosAlcancados: composicao?.modelosAlcancados ?? 0,
    rascunho,
    disponiveis,
    carregando: isPending,
    salvando: salvar.isPending,
    sujo,
    erro,
    acrescentar,
    remover,
    alternarObrigatorio,
    definirPadrao,
    mover,
    descartar,
    gravar,
  };
}

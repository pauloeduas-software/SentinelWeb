import { useMemo } from 'react';
import { useAssetColumnsStore } from '../../../domain/asset/asset.store';
import {
  COLUNAS_DE_ATIVO, COLUNAS_FIXAS, COLUNAS_PADRAO, colunasVisiveis, tokensDeExport,
} from '../helpers/asset-columns';

// O SELETOR DE COLUNAS, do lado da tela (F10, Etapa B).
//
// O store guarda a ESCOLHA; este hook devolve o que a tabela precisa saber
// (`mostrar`) e a operação que o menu dispara (`alternar`). A derivação fica
// aqui, e não no store, porque ela depende do CATÁLOGO — que muda com o deploy,
// enquanto o store guarda o que a pessoa clicou há meses.
export function useColunas(
  /**
   * As colunas customizadas que a tabela mostra (F9). Entram no `?columns=` do
   * export para o arquivo ter o que a tela tem — ver `tokensDeExport`.
   */
  camposCustomizados: readonly { slug: string }[] = [],
) {
  const preferencia = useAssetColumnsStore((estado) => estado.colunas);
  const definir = useAssetColumnsStore((estado) => estado.definir);
  const restaurar = useAssetColumnsStore((estado) => estado.restaurar);

  // `?? COLUNAS_PADRAO` só aqui: no store, "nunca mexi" é `null` de propósito
  // (ver `asset.store.ts`), e trocar isso por uma lista faria "desmarquei tudo"
  // e "nunca escolhi" virarem o mesmo estado.
  const escolhidas = preferencia ?? COLUNAS_PADRAO;
  const visiveis = useMemo(() => colunasVisiveis(escolhidas), [escolhidas]);

  const alternar = (token: string) => {
    // A fixa não alterna, e o menu já a desenha travada: a guarda aqui é para
    // o caminho que não passa pelo menu (um clique de teclado, um estado
    // gravado por versão antiga).
    if (COLUNAS_FIXAS.includes(token)) return;

    const proximas = visiveis.includes(token)
      ? visiveis.filter((atual) => atual !== token)
      : // Na ORDEM DO CATÁLOGO, não na ordem do clique: a tabela percorre
        // `COLUNAS_DE_ATIVO`, então uma lista fora de ordem produziria
        // cabeçalho e célula em posições diferentes se algum dia a tabela
        // passasse a iterar a preferência.
        COLUNAS_DE_ATIVO.filter((coluna) => coluna.token === token || visiveis.includes(coluna.token))
          .map((coluna) => coluna.token);

    definir(proximas);
  };

  return {
    catalogo: COLUNAS_DE_ATIVO,
    visiveis,
    /** O que o `?columns=` do export leva — ver `tokensDeExport`. */
    paraExportar: tokensDeExport(visiveis, camposCustomizados),
    mostrar: (token: string) => visiveis.includes(token),
    alternar,
    restaurar,
    /** Para o menu dizer que há algo a restaurar. */
    personalizado: preferencia !== null,
  };
}

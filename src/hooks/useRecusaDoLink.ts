import { useEffect, useEffectEvent, useRef } from 'react';
import { foiRecusa } from '../queries/erro.queries';
import { useNotificacao } from './useNotificacao';

// O LINK QUE NÃO ABRE (BF): a janela do registro que veio na URL não chegou a abrir.
//
// SÓ A PRIMEIRA CARGA CONTA. Com a janela aberta, o que falha é a atualização em
// segundo plano: o que está na tela continua valendo, e fechar a janela levaria o que
// a pessoa estava digitando. Enquanto a consulta tenta de novo, a falha antiga do
// cache ainda não diz nada.
//
// O ID SÓ SAI DO ENDEREÇO NA RECUSA (`foiRecusa`): o registro não existe mais, e o F5
// daria na mesma. Na falha passageira o endereço fica para tentar de novo, e o aviso
// não volta a cada retorno à aba, que refaz a consulta.

interface RecusaDoLink {
  /** A consulta do registro do link. */
  consulta: { error: Error | null; isFetching: boolean; isLoadingError: boolean };
  /** O id do endereço, com nenhuma janela aberta por outro caminho. */
  id: string | null;
  /** O começo da frase: "Não foi possível abrir o item do link". */
  frase: string;
  fechar: () => void;
}

export function useRecusaDoLink({ consulta, id, frase, fechar }: RecusaDoLink): void {
  const notificar = useNotificacao();
  const avisado = useRef<string | null>(null);
  const erro = id && consulta.isLoadingError && !consulta.isFetching ? consulta.error : null;

  const recusar = useEffectEvent((falha: Error) => {
    if (avisado.current !== id) notificar.erro(`${frase}: ${falha.message}`);
    avisado.current = foiRecusa(falha) ? null : id;
    if (foiRecusa(falha)) fechar();
  });

  useEffect(() => {
    if (erro) recusar(erro);
  }, [erro]);
}

import { useRef, useState } from 'react';
import { useNotificacao } from './useNotificacao';

// COPIAR (BF): quem diz que copiou é o próprio botão, e a falha vai para o cartão.
//
// Guarda O QUE foi copiado, não um booleano: o roteador reaproveita a tela de um
// ativo para outro, e um `true` sobreviveria à troca, com "Copiado" sem ninguém ter
// copiado.
const RETORNO_MS = 2000;

export function useCopiar(texto: string, frasePorFalha: string) {
  const notificar = useNotificacao();
  const [copiado, setCopiado] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(texto);
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setCopiado(null), RETORNO_MS);
    } catch {
      // Sem permissão de área de transferência: HTTP sem TLS, navegador que recusa.
      notificar.erro(frasePorFalha);
    }
  };

  return { copiado: copiado === texto, copiar };
}

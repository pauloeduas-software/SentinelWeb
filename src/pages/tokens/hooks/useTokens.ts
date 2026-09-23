import { useState } from 'react';
import {
  useAgentTokensQuery, useEmitirToken, useRevogarToken,
} from '../../../domain/auth/agent-token.queries';

// Estado da tela de TOKENS DO AGENTE.
//
// A única coisa de tela aqui que não é trivial: o SEGREDO recém-emitido.
//
// Ele vem uma vez na resposta do POST e não existe em lugar nenhum depois —
// nem no banco (só o sha256), nem em outra rota. Então a tela o guarda em
// `useState` até o operador mandar fechar, e o aviso diz isso com todas as
// letras. Guardá-lo no cache do react-query seria pior: uma revalidação o
// substituiria pela linha sem segredo e ele sumiria no meio da cópia.

export function useTokens() {
  const { data: tokens, isPending } = useAgentTokensQuery();
  const emitir = useEmitirToken();
  const revogar = useRevogarToken();

  const [nome, setNome] = useState('');
  const [segredo, setSegredo] = useState<string | null>(null);

  const handleEmitir = async () => {
    const limpo = nome.trim();
    if (!limpo) return;

    const emitido = await emitir.mutateAsync(limpo);
    setSegredo(emitido.token);
    setNome('');
  };

  const erro = emitir.error ?? revogar.error;

  return {
    tokens: tokens ?? [],
    carregando: isPending,
    erro: erro ? (erro as Error).message : null,

    nome,
    setNome,
    handleEmitir,
    emitindo: emitir.isPending,

    segredo,
    fecharSegredo: () => setSegredo(null),

    handleRevogar: (id: string) => revogar.mutate(id),
    revogando: revogar.isPending,
  };
}

import { useState } from 'react';
import {
  useConfirmarSegundoFator, useDesativarSegundoFator, useEmitirMeuToken, useIniciarSegundoFator,
  useMeusTokensQuery, useRevogarMeuToken, useSegundoFatorQuery,
} from '../../../domain/auth/seguranca.queries';
import type { CadastroDeSegundoFator } from '../../../domain/shared/auth.types';

// Estado da tela MINHA CONTA (F11, Etapa H).
//
// DUAS COISAS AQUI NÃO SÃO CACHE, e é por isso que elas moram em `useState` em
// vez de sair de uma query:
//
//   o QR do cadastro      vem de uma mutação (`enroll`), e cada chamada GERA UM
//                         SEGREDO NOVO. No cache, uma revalidação trocaria o
//                         segredo por baixo do QR que já está na tela — a pessoa
//                         leria um código que o servidor acabou de esquecer;
//   os códigos de          vêm UMA vez, na confirmação, e não existem em lugar
//   recuperação            nenhum depois (só o sha256). Uma revalidação os
//                          substituiria pelo status sem códigos, e eles sumiriam
//                          no meio da anotação.
//
// É o mesmo raciocínio do segredo do token na tela de agentes — e o mesmo
// `useState`, pela mesma razão.

export function useMinhaConta() {
  const { data: fator, isPending: carregandoFator } = useSegundoFatorQuery();
  const { data: tokens, isPending: carregandoTokens } = useMeusTokensQuery();

  const iniciar = useIniciarSegundoFator();
  const confirmar = useConfirmarSegundoFator();
  const desativar = useDesativarSegundoFator();
  const emitir = useEmitirMeuToken();
  const revogar = useRevogarMeuToken();

  // ── O cadastro em andamento ───────────────────────────────────────────────
  const [cadastro, setCadastro] = useState<CadastroDeSegundoFator | null>(null);
  const [codigo, setCodigo] = useState('');
  const [codigosDeRecuperacao, setCodigosDeRecuperacao] = useState<string[] | null>(null);

  // ── A desativação ─────────────────────────────────────────────────────────
  const [codigoParaDesativar, setCodigoParaDesativar] = useState('');
  const [desativando, setDesativando] = useState(false);

  // ── Os tokens ─────────────────────────────────────────────────────────────
  const [nomeDoToken, setNomeDoToken] = useState('');
  const [segredo, setSegredo] = useState<string | null>(null);

  const handleIniciar = async () => {
    const novo = await iniciar.mutateAsync();
    setCadastro(novo);
    setCodigo('');
  };

  const handleConfirmar = async () => {
    const { codigosDeRecuperacao: codigos } = await confirmar.mutateAsync(codigo.trim());
    setCodigosDeRecuperacao(codigos);
    // O QR sai da tela no mesmo passo: ele já foi lido, e um QR válido continuando
    // visível é um segredo exposto em cima da mesa de quem esqueceu a aba aberta.
    setCadastro(null);
    setCodigo('');
  };

  const handleDesativar = async () => {
    setDesativando(true);
    try {
      await desativar.mutateAsync(codigoParaDesativar.trim());
      setCodigoParaDesativar('');
      setCodigosDeRecuperacao(null);
    } finally {
      setDesativando(false);
    }
  };

  const handleEmitirToken = async () => {
    const limpo = nomeDoToken.trim();
    if (!limpo) return;

    const emitido = await emitir.mutateAsync(limpo);
    setSegredo(emitido.token);
    setNomeDoToken('');
  };

  // O erro mostrado é o da ÚLTIMA ação: as cinco mutações são exclusivas na
  // prática (ninguém confirma o cadastro e emite token no mesmo clique), e uma
  // faixa por mutação daria cinco lugares para a mesma frase aparecer.
  const erro = iniciar.error ?? confirmar.error ?? desativar.error ?? emitir.error ?? revogar.error;

  return {
    fator: fator ?? null,
    carregandoFator,
    erro: erro ? (erro as Error).message : null,

    cadastro,
    codigo, setCodigo,
    handleIniciar,
    iniciando: iniciar.isPending,
    handleConfirmar,
    confirmando: confirmar.isPending,
    cancelarCadastro: () => { setCadastro(null); setCodigo(''); },

    codigosDeRecuperacao,
    fecharCodigos: () => setCodigosDeRecuperacao(null),

    codigoParaDesativar, setCodigoParaDesativar,
    handleDesativar,
    desativando,

    tokens: tokens ?? [],
    carregandoTokens,
    nomeDoToken, setNomeDoToken,
    handleEmitirToken,
    emitindo: emitir.isPending,
    segredo,
    fecharSegredo: () => setSegredo(null),
    handleRevogarToken: (id: string) => revogar.mutate(id),
    revogando: revogar.isPending,
  };
}

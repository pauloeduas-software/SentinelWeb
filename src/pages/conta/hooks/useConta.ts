import { useState } from 'react';
import { useNotificacao } from '../../../hooks/useNotificacao';
import { useAuthStore } from '../../../stores/auth.store';

// Estado da tela Minha conta (AR): o nome em edição. A senha tem o formulário
// próprio (`FormularioDeSenha`), que guarda o que digitou.

export function useConta() {
  const notificar = useNotificacao();
  const usuario = useAuthStore((estado) => estado.usuario);
  const atualizarNome = useAuthStore((estado) => estado.atualizarNome);
  const trocarSenha = useAuthStore((estado) => estado.trocarSenha);

  // O que está digitado. `null` = não mexeu: o campo mostra o nome da sessão.
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const nome = rascunho ?? usuario?.name ?? '';

  const salvarNome = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await atualizarNome(nome);
      setRascunho(null);
      notificar.sucesso('Nome salvo.');
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const trocarSenhaDaConta = async (senhaAtual: string | null, senhaNova: string) => {
    await trocarSenha(senhaAtual, senhaNova);
    notificar.sucesso('Senha trocada.');
  };

  return {
    nome, email: usuario?.email ?? '', changeNome: setRascunho, salvarNome, erro, salvando,
    alterado: rascunho !== null && rascunho !== usuario?.name,
    trocarSenha: trocarSenhaDaConta,
  };
}

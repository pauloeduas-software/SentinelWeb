import { useState } from 'react';
import { useAuthStore } from '../../../stores/auth.store';

// Estado da tela Minha conta (AR): o nome em edição e o aviso de que salvou. A
// senha tem o formulário próprio (`FormularioDeSenha`), que guarda o que digitou.

export function useConta() {
  const usuario = useAuthStore((estado) => estado.usuario);
  const atualizarNome = useAuthStore((estado) => estado.atualizarNome);
  const trocarSenha = useAuthStore((estado) => estado.trocarSenha);

  // O que está digitado. `null` = não mexeu: o campo mostra o nome da sessão.
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const nome = rascunho ?? usuario?.name ?? '';

  const changeNome = (valor: string) => {
    setRascunho(valor);
    setSalvo(false);
  };

  const salvarNome = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await atualizarNome(nome);
      setRascunho(null);
      setSalvo(true);
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return {
    usuario, nome, changeNome, salvarNome, erro, salvo, salvando,
    alterado: rascunho !== null && rascunho !== usuario?.name,
    trocarSenha,
  };
}

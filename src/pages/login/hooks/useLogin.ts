import { useState } from 'react';
import { useAuthStore } from '../../../domain/auth/auth.store';

// Estado da tela de login: o que está digitado, o que está em voo e o que deu
// errado. A página é só markup, como toda página do painel.
export function useLogin() {
  const entrar = useAuthStore((estado) => estado.entrar);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setErro('');

    try {
      await entrar({ username, password });
      // NÃO navega aqui: quem decide o que mostrar é o `App.tsx`, olhando o
      // usuário do store. Um `navigate('/')` a mais criaria um segundo lugar
      // decidindo a mesma coisa — e os dois discordariam no primeiro caso de
      // borda (login numa aba, logout na outra).
    } catch (falha) {
      // `error.message` já vem traduzido pelo `apiClient`: é a frase que o
      // servidor escreveu ("Usuário ou senha inválidos.", "Conta bloqueada por
      // excesso de tentativas...").
      setErro((falha as Error).message);
      // A senha sai da memória do componente a cada recusa: quem errou vai
      // digitar de novo, e um campo preenchido convida a insistir no mesmo erro.
      setPassword('');
    } finally {
      setEnviando(false);
    }
  };

  return { username, setUsername, password, setPassword, erro, enviando, handleSubmit };
}

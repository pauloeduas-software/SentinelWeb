import { useState } from 'react';
import { useAuthStore } from '../../../domain/auth/auth.store';

// Estado da tela de login: o que está digitado, o que está em voo e o que deu
// errado. A página é só markup, como toda página do painel.
//
// ═════════════════════════════════════════════════════════════════════════════
// O SEGUNDO FATOR É UM PASSO DA MESMA TELA (F11, Etapa H), e não uma rota nova.
//
// O servidor responde 401 com `etapa: 'TOTP'` quando a senha está certa e falta o
// código. A tela então mostra o campo do código e reenvia os TRÊS valores —
// usuário, senha e código — numa requisição só.
//
// POR QUE REENVIAR A SENHA, em vez de o servidor guardar um "login pela metade":
// um estado intermediário no servidor seria uma meia-sessão, com validade, lugar
// para morar e um token próprio para o cliente trazer de volta — ou seja, uma
// segunda forma de sessão existir, ao lado do cookie. O projeto tem UMA
// (docs/referencia/acesso.md), e a senha ainda está na memória do formulário de
// qualquer forma: ela acabou de ser digitada nele.
//
// A CONSEQUÊNCIA VISÍVEL, e é de propósito: a senha NÃO é limpa quando o erro é o
// do código. Limpá-la obrigaria a digitar a senha de novo por ter errado seis
// dígitos. Nos outros erros ela continua sendo apagada.
// ═════════════════════════════════════════════════════════════════════════════

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

  return {
    username, setUsername,
    password, setPassword,
    erro, enviando, handleSubmit,
  };
}

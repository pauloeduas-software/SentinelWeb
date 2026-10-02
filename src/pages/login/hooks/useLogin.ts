import { useState } from 'react';
import { useAuthStore } from '../../../domain/auth/auth.store';
import { pedindoSegundoFator } from '../../../domain/auth/auth.queries';

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
// (docs/AUTENTICACAO.md), e a senha ainda está na memória do formulário de
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

  /** A tela está no passo do segundo fator? */
  const [pedindoCodigo, setPedindoCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');
  /** Quem perdeu o celular digita um código de recuperação em vez do do app. */
  const [usandoRecuperacao, setUsandoRecuperacao] = useState(false);

  const handleSubmit = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setErro('');

    // O campo do código só viaja quando existe: o `loginSchema` do servidor é
    // `strictObject`, e `totp: ''` seria 422 ("exatamente 6 dígitos") em vez da
    // recusa que a tela sabe tratar.
    const segundoFator = !pedindoCodigo || codigo.trim() === ''
      ? {}
      : usandoRecuperacao
        ? { recoveryCode: codigo.trim() }
        : { totp: codigo.trim() };

    try {
      await entrar({ username, password, ...segundoFator });
    } catch (falha) {
      // `error.message` já vem traduzido pelo `apiClient`: é a frase que o
      // servidor escreveu ("Usuário ou senha inválidos.", "Conta bloqueada por
      // excesso de tentativas...").
      setErro((falha as Error).message);

      // A pergunta é do DOMÍNIO, não da tela: quem conhece o formato do corpo do
      // erro é `domain/auth`, e página não fala HTTP (eslint.config.js). Aqui só
      // se decide o que desenhar com a resposta.
      if (pedindoSegundoFator(falha)) {
        setPedindoCodigo(true);
        setCodigo('');
      } else {
        // A senha sai da memória do componente a cada recusa de CREDENCIAL: quem
        // errou vai digitar de novo, e um campo preenchido convida a insistir no
        // mesmo erro. No passo do código ela fica — ver o cabeçalho.
        setPassword('');
        setPedindoCodigo(false);
        setCodigo('');
      }
    } finally {
      setEnviando(false);
    }
  };

  return {
    username, setUsername,
    password, setPassword,
    erro, enviando, handleSubmit,
    pedindoCodigo,
    codigo, setCodigo,
    usandoRecuperacao,
    // Trocar de caminho limpa o que já estava digitado: os dois campos têm
    // formatos diferentes (seis dígitos × `XXXXX-XXXXX`), e deixar o texto velho
    // garante um "código inválido" no primeiro envio depois da troca.
    alternarRecuperacao: () => {
      setUsandoRecuperacao((antes) => !antes);
      setCodigo('');
      setErro('');
    },
  };
}

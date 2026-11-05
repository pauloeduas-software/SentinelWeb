import { useState } from 'react';
import CampoDeSenha from '../../../components/CampoDeSenha';
import { Aviso } from '../../../components/ui/aviso';
import { Button } from '../../../components/ui/button';
import { Campo } from '../../../components/ui/campo';

// O FORMULÁRIO DE TROCA DA PRÓPRIA SENHA (AR) — o mesmo em Minha conta e na tela
// de troca obrigatória. A troca obrigatória não pede a senha de hoje (AU): a
// pessoa acabou de digitar a temporária no login.
//
// A confirmação é conferida AQUI, antes de pedir ao servidor: ele não conhece o
// campo, e uma senha digitada errada duas vezes seguidas no mesmo erro é o que a
// segunda caixa existe para pegar. O tamanho e o resto das regras são do servidor.

interface FormularioDeSenhaProps {
  /** Pede a senha de hoje — Minha conta. Falso na troca obrigatória, que manda `null`. */
  pedirAtual: boolean;
  rotuloDoBotao: string;
  onSubmit: (senhaAtual: string | null, senhaNova: string) => Promise<void>;
}

export default function FormularioDeSenha({ pedirAtual, rotuloDoBotao, onSubmit }: FormularioDeSenhaProps) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErro('');
    if (nova !== confirmacao) {
      setErro('A confirmação não é igual à nova senha.');
      return;
    }

    setEnviando(true);
    try {
      await onSubmit(pedirAtual ? atual : null, nova);
      // Deu certo: nada da senha fica na memória do formulário.
      setAtual('');
      setNova('');
      setConfirmacao('');
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {erro && <Aviso>{erro}</Aviso>}

      {pedirAtual && (
        <Campo rotulo="Senha atual">
          <CampoDeSenha required autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
        </Campo>
      )}

      <Campo rotulo="Nova senha" ajuda="Mínimo de 12 caracteres. Trocar encerra as suas outras sessões abertas.">
        <CampoDeSenha required autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
      </Campo>

      <Campo rotulo="Repita a nova senha">
        <CampoDeSenha required autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
      </Campo>

      {/* Na tela cheia da troca obrigatória o botão ocupa a largura, como no login. */}
      <Button type="submit" disabled={enviando} className={pedirAtual ? undefined : 'w-full'}>
        {enviando ? 'Salvando...' : rotuloDoBotao}
      </Button>
    </form>
  );
}

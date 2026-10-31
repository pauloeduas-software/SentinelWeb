import { useState } from 'react';
import CampoDeSenha from '../../../components/CampoDeSenha';

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

const CAMPO = 'w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors';
const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

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
    <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
      {erro && (
        <div role="alert" className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20 rounded">
          {erro}
        </div>
      )}

      {pedirAtual && (
        <div className="space-y-1">
          <label htmlFor="senha-atual" className={ROTULO}>Senha atual</label>
          <CampoDeSenha id="senha-atual" required autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} className={CAMPO} />
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="senha-nova" className={ROTULO}>Nova senha</label>
        <CampoDeSenha id="senha-nova" required autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} className={CAMPO} />
        <p className="text-text-tertiary text-[10px] leading-relaxed">
          Mínimo de 12 caracteres. Trocar encerra as suas outras sessões abertas.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="senha-confirmacao" className={ROTULO}>Repita a nova senha</label>
        <CampoDeSenha id="senha-confirmacao" required autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className={CAMPO} />
      </div>

      <div className="pt-4 border-t border-border-sutil">
        <button type="submit" disabled={enviando} className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50 uppercase tracking-widest">
          {enviando ? 'Salvando...' : rotuloDoBotao}
        </button>
      </div>
    </form>
  );
}

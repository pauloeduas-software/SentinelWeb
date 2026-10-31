import { KeyRound, LayoutDashboard } from 'lucide-react';
import FormularioDeSenha from './FormularioDeSenha';
import { useAuthStore } from '../../../stores/auth.store';

// A TELA DE QUEM ENTROU COM A SENHA TEMPORÁRIA (AR).
//
// Ocupa o lugar do painel inteiro, sem menu: o servidor só deixa esta conta
// alcançar "quem sou eu", "sair" e a troca da senha, então qualquer outra tela
// voltaria 403. Sair é o único outro caminho — quem abriu a conta de outra
// pessoa por engano não fica preso aqui.
export default function TrocaObrigatoria() {
  const nome = useAuthStore((estado) => estado.usuario?.name);
  const trocarSenha = useAuthStore((estado) => estado.trocarSenha);
  const sair = useAuthStore((estado) => estado.sair);

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-sans flex items-center justify-center p-6">
      <div className="w-full max-w-sm motion-safe:animate-fade-in">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-text-primary p-1 rounded-sm">
            <LayoutDashboard size={14} className="text-bg-base" />
          </div>
          <h1 className="text-sm font-bold tracking-tight uppercase">Sentinel</h1>
        </div>

        <div className="bg-surface-card border border-border-sutil">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-border-sutil bg-bg-base/50">
            <KeyRound size={14} className="text-text-tertiary" />
            <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">Escolha a sua senha</h2>
          </div>

          <div className="p-6 space-y-4">
            <p className="font-mono text-xs text-text-secondary leading-relaxed">
              {nome ? `${nome}, você` : 'Você'} entrou com uma senha temporária. Escolha a sua para continuar:
              a temporária deixa de valer assim que você salvar.
            </p>
            <FormularioDeSenha pedirAtual={false} rotuloDoBotao="Definir senha" onSubmit={trocarSenha} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void sair()}
          className="mt-4 font-mono text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary transition-colors"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

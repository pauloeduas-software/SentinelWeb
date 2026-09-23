import { LayoutDashboard, Lock } from 'lucide-react';
import { useLogin } from './hooks/useLogin';

// A porta de entrada do painel.
//
// Mesma linguagem visual do resto (mono, caixa alta, traço fino): é a primeira
// tela que alguém vê, e uma tela de login genérica no meio de um painel com
// identidade própria parece a de outro sistema.
export default function LoginPage() {
  const { username, setUsername, password, setPassword, erro, enviando, handleSubmit } = useLogin();

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-sans flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-in fade-in duration-300">

        <div className="flex items-center gap-3 mb-8">
          <div className="bg-text-primary p-1 rounded-sm">
            <LayoutDashboard size={14} className="text-bg-base" />
          </div>
          <h1 className="text-sm font-bold tracking-tight uppercase">Sentinel</h1>
        </div>

        <div className="bg-surface-card border border-border-sutil">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-border-sutil bg-bg-base/50">
            <Lock size={14} className="text-text-tertiary" />
            <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">Acesso restrito</h2>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 font-mono text-xs">
            {erro && (
              <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20 rounded">
                {erro}
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="username" className="text-text-secondary uppercase tracking-widest text-[10px]">
                Usuário
              </label>
              <input
                id="username"
                required
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(evento) => setUsername(evento.target.value)}
                className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors"
                placeholder="Ex: admin"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-text-secondary uppercase tracking-widest text-[10px]">
                Senha
              </label>
              <input
                id="password"
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(evento) => setPassword(evento.target.value)}
                className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors"
                placeholder="••••••••"
              />
            </div>

            <div className="pt-4 border-t border-border-sutil">
              <button
                type="submit"
                disabled={enviando}
                className="w-full px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50 uppercase tracking-widest"
              >
                {enviando ? 'Entrando...' : 'Entrar'}
              </button>
            </div>
          </form>
        </div>

        <p className="mt-6 text-[10px] font-mono text-text-tertiary uppercase tracking-widest text-center">
          Sessão de 8 horas · Cinco erros bloqueiam a conta por 15 minutos
        </p>
      </div>
    </div>
  );
}

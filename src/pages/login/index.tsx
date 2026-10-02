import { Building2, KeyRound, LayoutDashboard, Lock, ShieldCheck } from 'lucide-react';
import { useLogin } from './hooks/useLogin';
import { useDiretorioLigado } from '../../domain/access/access.queries';

// A porta de entrada do painel.
//
// Mesma linguagem visual do resto (mono, caixa alta, traço fino): é a primeira
// tela que alguém vê, e uma tela de login genérica no meio de um painel com
// identidade própria parece a de outro sistema.
export default function LoginPage() {
  const {
    username, setUsername, password, setPassword, erro, enviando, handleSubmit,
    pedindoCodigo, codigo, setCodigo, usandoRecuperacao, alternarRecuperacao,
  } = useLogin();

  // SE O SERVIDOR TEM SSO CONFIGURADO (F11, Etapa I). A rota é pública justamente
  // para esta pergunta poder ser feita aqui, sem sessão — e a resposta são dois
  // booleanos, sem endpoint nem client id.
  const { data: diretorio } = useDiretorioLigado();

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

            {/* ── O SEGUNDO PASSO (F11, Etapa H) ─────────────────────────
                Aparece só depois de o servidor responder `etapa: 'TOTP'`, ou
                seja: a senha está certa. Os campos de cima FICAM na tela, com o
                valor — é a mesma requisição que vai de novo, com o código a mais.

                `autoFocus` aqui e não no usuário quando o passo troca: o cursor
                tem de ir para o único campo que falta preencher. */}
            {pedindoCodigo && (
              <div className="space-y-2 border border-status-info/30 bg-status-info/5 p-3">
                <div className="flex items-center gap-2 text-status-info">
                  <ShieldCheck size={13} />
                  <span className="uppercase tracking-widest text-[10px]">Verificação em duas etapas</span>
                </div>

                <div className="space-y-1">
                  <label htmlFor="codigo" className="text-text-secondary uppercase tracking-widest text-[10px]">
                    {usandoRecuperacao ? 'Código de recuperação' : 'Código do aplicativo'}
                  </label>
                  <input
                    id="codigo"
                    required
                    autoFocus
                    // `one-time-code` é o que faz o iOS e o Android oferecerem o
                    // código vindo do SMS/autenticador no teclado.
                    autoComplete="one-time-code"
                    inputMode={usandoRecuperacao ? 'text' : 'numeric'}
                    value={codigo}
                    onChange={(evento) => setCodigo(evento.target.value)}
                    className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary tracking-[0.3em] focus:outline-none focus:border-text-secondary transition-colors"
                    placeholder={usandoRecuperacao ? 'XXXXX-XXXXX' : '000000'}
                  />
                </div>

                <button
                  type="button"
                  onClick={alternarRecuperacao}
                  className="flex items-center gap-1 text-text-tertiary hover:text-text-primary transition-colors text-[10px] uppercase tracking-widest"
                >
                  <KeyRound size={11} />
                  {usandoRecuperacao ? 'Usar o aplicativo' : 'Perdi o celular: usar código de recuperação'}
                </button>
              </div>
            )}

            <div className="pt-4 border-t border-border-sutil">
              <button
                type="submit"
                disabled={enviando}
                className="w-full px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50 uppercase tracking-widest"
              >
                {enviando ? 'Entrando...' : pedindoCodigo ? 'Confirmar código' : 'Entrar'}
              </button>
            </div>
          </form>
        </div>

        {/* ── A ENTRADA ÚNICA (F11, Etapa I) ─────────────────────────────────
            `<a>` E NÃO `<button>` com `fetch`: entrar por SSO é uma NAVEGAÇÃO —
            o servidor grava o cookie do desafio e responde 302 para o provedor.
            Um `fetch` seguiria o redirecionamento por baixo, receberia o HTML da
            tela de login da Microsoft e não levaria ninguém a lugar nenhum.

            Fora do `<form>` de propósito: um link dentro dele que fosse clicado
            com Enter poderia disparar o submit da senha.

            E ele aparece ABAIXO do formulário, não acima: a maioria das contas
            deste sistema é local (o SSO alcança só quem alguém federou
            explicitamente — D78), e pôr o caminho da minoria em primeiro lugar
            convidaria ao clique errado. */}
        {diretorio?.oidc && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border-sutil" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-tertiary">ou</span>
              <span className="h-px flex-1 bg-border-sutil" />
            </div>
            <a
              href="/api/auth/oidc/start"
              className="flex w-full items-center justify-center gap-2 border border-border-sutil px-4 py-2 font-mono text-xs uppercase tracking-widest text-text-secondary transition-colors hover:bg-surface-card hover:text-text-primary"
            >
              <Building2 size={13} />
              Entrar com a conta da empresa
            </a>
          </div>
        )}

        <p className="mt-6 text-[10px] font-mono text-text-tertiary uppercase tracking-widest text-center">
          Sessão de 8 horas · Cinco erros bloqueiam a conta por 15 minutos
        </p>
      </div>
    </div>
  );
}

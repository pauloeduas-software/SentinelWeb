import { Lock } from 'lucide-react';
import { useLogin } from './hooks/useLogin';
import CampoDeSenha from '../../components/CampoDeSenha';
import MenuDoTema from '../../components/MenuDoTema';
import SentinelLogo from '../../components/SentinelLogo';
import { Aviso } from '../../components/ui/aviso';
import { Button } from '../../components/ui/button';
import { Campo } from '../../components/ui/campo';
import { Input } from '../../components/ui/input';

// A porta de entrada do painel: a marca à esquerda, o formulário à direita. No
// celular fica só o formulário, com a marca em cima.
export default function LoginPage() {
  const {
    email, setEmail, password, setPassword, erro, enviando, handleSubmit,
  } = useLogin();

  return (
    <div className="relative flex min-h-screen bg-bg-base text-text-primary">
      <MenuDoTema className="absolute right-4 top-4 z-10" />

      <div className="relative hidden items-center justify-center border-r border-border-sutil bg-accent bg-gradient-to-br from-primary/40 via-primary/15 to-accent p-12 dark:bg-surface-muted dark:from-primary/20 dark:via-primary/5 dark:to-bg-base lg:flex lg:w-1/2">
        <div className="flex max-w-2xl flex-col items-center space-y-7 text-center">
          <SentinelLogo className="size-44 drop-shadow-2xl" />
          <div className="space-y-2">
            <h1 className="text-5xl font-bold tracking-tight text-primary">Sentinel</h1>
            <p className="text-lg text-text-secondary dark:text-text-tertiary xl:text-xl">Inventário de TI: computadores, postos, estoque e licenças.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-4 lg:p-8">
        <div className="w-full max-w-md space-y-7 motion-safe:animate-fade-in">
          <div className="space-y-2 text-center">
            <div className="mb-4 flex justify-center lg:hidden">
              <SentinelLogo className="size-16" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Entrar</h2>
            <p className="text-base text-text-tertiary">Use o e-mail e a senha da sua conta.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 [&_label]:text-base">
            {erro && <Aviso>{erro}</Aviso>}

            <Campo rotulo="E-mail">
              <Input
                required
                autoFocus
                type="email"
                autoComplete="username"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                className="h-12 text-base"
              />
            </Campo>

            <Campo rotulo="Senha">
              <CampoDeSenha
                required
                autoComplete="current-password"
                value={password}
                onChange={(evento) => setPassword(evento.target.value)}
                className="h-12 text-base"
                placeholder="••••••••"
              />
            </Campo>

            <Button type="submit" disabled={enviando} className="h-12 w-full text-lg">
              <Lock /> {enviando ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

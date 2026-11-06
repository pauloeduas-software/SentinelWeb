import FormularioDeSenha from './FormularioDeSenha';
import SentinelLogo from '../../../components/SentinelLogo';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
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
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4 text-text-primary">
      <div className="w-full max-w-sm space-y-6 motion-safe:animate-fade-in">
        <div className="space-y-2 text-center">
          <div className="mb-4 flex justify-center">
            <SentinelLogo className="size-16" />
          </div>
          <h1 className="text-2xl font-bold">Escolha a sua senha</h1>
          <p className="text-sm text-text-tertiary">
            {nome ? `${nome}, você` : 'Você'} entrou com uma senha temporária. Escolha a sua para continuar.
          </p>
        </div>

        <Card className="p-6">
          <FormularioDeSenha pedirAtual={false} rotuloDoBotao="Definir senha" rotuloEnviando="Definindo…" onSubmit={trocarSenha} />
        </Card>

        <Button variant="ghost" className="w-full" onClick={() => void sair()}>Sair</Button>
      </div>
    </div>
  );
}

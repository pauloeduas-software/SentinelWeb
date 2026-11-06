import type { ReactNode } from 'react';
import FormularioDeSenha from './components/FormularioDeSenha';
import { useConta } from './hooks/useConta';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Aviso } from '../../components/ui/aviso';
import { Button } from '../../components/ui/button';
import { Campo } from '../../components/ui/campo';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';

// MINHA CONTA (AR): a pessoa edita o próprio nome e troca a própria senha, sem
// passar por um administrador. O e-mail é o login e o cargo é dado de
// administrador: os dois ficam em Usuários.

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Card>
      <h3 className="px-6 pt-6 text-sm font-medium text-text-primary">{titulo}</h3>
      <div className="p-6">{children}</div>
    </Card>
  );
}

export default function ContaPage() {
  const { nome, changeNome, salvarNome, erro, salvando, alterado, trocarSenha } = useConta();

  return (
    <div className="motion-safe:animate-fade-in flex max-w-xl flex-col pb-6">

      <PaginaCabecalho titulo="Minha conta" />

      <div className="space-y-6">
        <Secao titulo="Nome">
          <form onSubmit={salvarNome} className="space-y-4">
            {erro && <Aviso>{erro}</Aviso>}
            <Campo rotulo="Nome completo" obrigatorio>
              <Input required value={nome} onChange={(e) => changeNome(e.target.value)} />
            </Campo>
            <Button type="submit" disabled={salvando || !alterado}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </form>
        </Secao>

        <Secao titulo="Senha">
          <FormularioDeSenha pedirAtual rotuloDoBotao="Trocar senha" rotuloEnviando="Trocando…" onSubmit={trocarSenha} />
        </Secao>
      </div>
    </div>
  );
}

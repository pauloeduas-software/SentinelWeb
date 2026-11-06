import { KeyRound, Save, UserRound } from 'lucide-react';
import CartaoDeIdentidade from './components/CartaoDeIdentidade';
import FormularioDeSenha from './components/FormularioDeSenha';
import SecaoDaConta from './components/SecaoDaConta';
import { useConta } from './hooks/useConta';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Aviso } from '../../components/ui/aviso';
import { Button } from '../../components/ui/button';
import { Campo } from '../../components/ui/campo';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';

// MINHA CONTA (AR): a pessoa edita o próprio nome e troca a própria senha, sem
// passar por um administrador. O e-mail é o login e o cargo é dado de
// administrador: os dois ficam em Usuários. O desenho é o do Meu Perfil da
// IntraNet (AY): quem é à esquerda, o que se edita em abas à direita.

export default function ContaPage() {
  const { nome, email, changeNome, salvarNome, erro, salvando, alterado, trocarSenha } = useConta();

  return (
    <div className="motion-safe:animate-fade-in mx-auto max-w-360 pb-6">

      <PaginaCabecalho titulo="Minha conta" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <CartaoDeIdentidade />

        <Tabs defaultValue="dados" className="lg:col-span-2">
          <TabsList className="mb-8">
            <TabsTrigger value="dados" className="py-3 text-base [&_svg]:size-5"><UserRound /> Dados pessoais</TabsTrigger>
            <TabsTrigger value="senha" className="py-3 text-base [&_svg]:size-5"><KeyRound /> Senha</TabsTrigger>
          </TabsList>

          <TabsContent value="dados">
            <form onSubmit={salvarNome}>
              <SecaoDaConta
                titulo="Informações básicas"
                botao={(
                  <Button type="submit" disabled={salvando || !alterado}>
                    <Save /> {salvando ? 'Salvando…' : 'Salvar'}
                  </Button>
                )}
              >
                {erro && <Aviso className="md:col-span-2">{erro}</Aviso>}
                <Campo rotulo="Nome completo" obrigatorio>
                  <Input required value={nome} onChange={(e) => changeNome(e.target.value)} />
                </Campo>
                <Campo rotulo="E-mail (não editável)">
                  <Input disabled value={email} />
                </Campo>
              </SecaoDaConta>
            </form>
          </TabsContent>

          <TabsContent value="senha">
            <FormularioDeSenha pedirAtual rotuloDoBotao="Trocar senha" rotuloEnviando="Trocando…" onSubmit={trocarSenha} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import FormularioDeSenha from './components/FormularioDeSenha';
import { useConta } from './hooks/useConta';

// MINHA CONTA (AR): a pessoa edita o próprio nome e troca a própria senha, sem
// passar por um administrador. O e-mail é o login e o cargo é dado de
// administrador: os dois ficam em Usuários.
const CAMPO = 'w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors';

export default function ContaPage() {
  const { usuario, nome, changeNome, salvarNome, erro, salvo, salvando, alterado, trocarSenha } = useConta();

  return (
    <div className="motion-safe:animate-fade-in max-w-xl">
      <div className="mb-8">
        <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Minha conta</h2>
        <p className="text-xs text-text-tertiary mt-2 font-mono">{usuario?.email}</p>
      </div>

      <section className="bg-surface-card border border-border-sutil mb-6">
        <h3 className="px-6 py-4 border-b border-border-sutil bg-bg-base/50 text-sm font-mono text-text-primary tracking-widest uppercase">
          Nome
        </h3>
        <form onSubmit={salvarNome} className="p-6 space-y-4 font-mono text-xs">
          {erro && (
            <div role="alert" className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20 rounded">
              {erro}
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="conta-nome" className="text-text-secondary uppercase tracking-widest text-[10px]">Nome completo</label>
            <input id="conta-nome" required type="text" value={nome} onChange={(e) => changeNome(e.target.value)} className={CAMPO} />
          </div>
          <div className="pt-4 border-t border-border-sutil flex items-center gap-4">
            <button type="submit" disabled={salvando || !alterado} className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50 uppercase tracking-widest">
              {salvando ? 'Salvando...' : 'Salvar nome'}
            </button>
            {salvo && <span role="status" className="text-status-success">Nome salvo.</span>}
          </div>
        </form>
      </section>

      <section className="bg-surface-card border border-border-sutil">
        <h3 className="px-6 py-4 border-b border-border-sutil bg-bg-base/50 text-sm font-mono text-text-primary tracking-widest uppercase">
          Senha
        </h3>
        <div className="p-6">
          <FormularioDeSenha pedirAtual rotuloDoBotao="Trocar senha" onSubmit={trocarSenha} />
        </div>
      </section>
    </div>
  );
}

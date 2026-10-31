import { useState } from 'react';
import { X } from 'lucide-react';
import type { User } from '../../../types/user.types';
import type { UserInput } from '../../../queries/user.queries';

// O FORMULÁRIO DE USUÁRIO — quem opera o sistema: nome e e-mail.
//
// SEM CAMPO DE CARGO: hoje há um cargo só, Administrador (Z), e não há o que
// escolher. A conta nova nasce `ADMIN` pelo `@default` da coluna, e a edição não
// manda `role`, então não mexe nele. O campo volta com a separação de cargos,
// que é decisão a tomar.
//
// SEM CAMPO DE SENHA (AU): quem cadastra não escolhe a senha de outra pessoa. A
// conta nasce com uma temporária, que aparece aqui uma vez, e a pessoa escolhe
// a dela ao entrar. A de quem esqueceu é o botão Gerar senha temporária.
//
// Quem só RECEBE equipamento não é usuário: é colaborador, cadastrado na página
// Colaboradores.

interface UserFormModalProps {
  user?: User | null;
  onClose: () => void;
  /** Devolve a senha temporária no cadastro (AU); `null` na edição, que fecha a janela. */
  onSubmit: (data: UserInput) => Promise<string | null>;
  /**
   * Gera a senha temporária desta conta (AR) e a devolve; `null` se a pessoa
   * desistiu no confirm. Ausente no cadastro e na PRÓPRIA conta: a sua senha se
   * troca em Minha conta.
   */
  onGerarSenhaTemporaria?: () => Promise<string | null>;
}

export default function UserFormModal({ user, onClose, onSubmit, onGerarSenhaTemporaria }: UserFormModalProps) {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // A senha temporária gerada, mostrada UMA vez: o servidor só guarda o hash.
  const [temporaria, setTemporaria] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);
  // O cadastro deu certo: a senha da conta nova está na tela, e os campos travam.
  const criada = !user && temporaria !== null;

  const gerarTemporaria = async () => {
    if (!onGerarSenhaTemporaria) return;
    setError('');
    try {
      const senha = await onGerarSenhaTemporaria();
      if (senha) setTemporaria(senha);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(temporaria ?? '');
      setCopiada(true);
    } catch {
      // Sem permissão de área de transferência: a senha está na tela para copiar à mão.
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const senha = await onSubmit({
        name: formData.name,
        email: formData.email,
        // `isActive` NÃO viaja daqui: desativar e ativar são o botão da linha,
        // em Ações (`useUsers.handleAlternarAtivo`), o mesmo padrão das outras
        // listas. Quem nasce, nasce ativo — o `strictObject` do create recusa o
        // campo.
      });
      if (senha) setTemporaria(senha);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-surface-card border border-border-sutil shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">
            {user ? 'Editar Usuário' : 'Novo Usuário'}
          </h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-mono text-xs">
          {error && <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20 rounded">{error}</div>}

          <div className="space-y-1">
            <label className="text-text-secondary uppercase tracking-widest text-[10px]">Nome Completo*</label>
            <input required disabled={criada} type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors" />
          </div>

          <div className="space-y-1">
            <label className="text-text-secondary uppercase tracking-widest text-[10px]">E-mail*</label>
            <input required disabled={criada} type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors" />
          </div>

          {(onGerarSenhaTemporaria || temporaria) && (
            <div className="space-y-2 pt-2 border-t border-border-sutil">
              {temporaria ? (
                <div className="space-y-2">
                  <p className="text-text-secondary uppercase tracking-widest text-[10px]">Senha temporária</p>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 p-2 bg-bg-base border border-border-sutil text-text-primary select-all tracking-widest">{temporaria}</code>
                    <button type="button" onClick={() => void copiar()} className="px-3 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors">
                      {copiada ? 'Copiada' : 'Copiar'}
                    </button>
                  </div>
                  <p className="text-text-tertiary text-[10px] leading-relaxed">
                    Aparece só agora: feche e ela não volta. Entregue à pessoa; ela escolhe a própria senha no primeiro acesso.
                  </p>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => void gerarTemporaria()} className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors">
                    Gerar senha temporária
                  </button>
                  <p className="text-text-tertiary text-[10px] leading-relaxed">
                    Para quem esqueceu a senha: a de hoje deixa de valer e a pessoa escolhe outra ao entrar.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-border-sutil">
            {/* Cadastrada a conta, o que resta é fechar: salvar de novo criaria outra. */}
            {criada ? (
              <button type="button" onClick={onClose} className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors">
                Fechar
              </button>
            ) : (
              <>
                <button type="button" onClick={onClose} className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50">
                  {loading ? 'Salvando...' : 'Salvar Usuário'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

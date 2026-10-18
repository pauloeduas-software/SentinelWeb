import { useState } from 'react';
import { X } from 'lucide-react';
import type { User } from '../../../domain/shared/user.types';
import type { UserInput } from '../../../domain/user/user.queries';

// O FORMULÁRIO DE CADASTRO — nome, e-mail, cargo e, para quem entra, senha.
//
// O e-mail é o login. A SENHA só aparece para Técnico e Administrador, os dois
// cargos que operam o painel: o `Usuario` só recebe equipamento e o login o
// recusa de qualquer jeito. No cadastro desses dois a senha é obrigatória; na
// edição é "Nova senha" — em branco mantém a atual, preenchida troca e encerra
// as sessões abertas da pessoa. As regras de tamanho são do servidor.

interface UserFormModalProps {
  user?: User | null;
  onClose: () => void;
  onSubmit: (data: UserInput) => Promise<void>;
}

export default function UserFormModal({ user, onClose, onSubmit }: UserFormModalProps) {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    // O CARGO (D148). Conta nova nasce `USUARIO`, que é o `@default` da coluna —
    // a porta fechada por padrão da F3 levada à autorização.
    role: user?.role || 'USUARIO',
  });
  // Fora do `formData` porque nunca vem do registro: o servidor não devolve
  // senha, e o campo sempre abre vazio.
  const [password, setPassword] = useState('');
  const entraNoSistema = formData.role !== 'USUARIO';
  // Quem já entrava troca a senha se quiser ("Nova senha"); quem está sendo
  // CRIADO ou PROMOVIDO de Usuário precisa de uma — o servidor recusa sem ela.
  const senhaObrigatoria = entraNoSistema && (!user || user.role === 'USUARIO');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await onSubmit({
        name: formData.name,
        email: formData.email,
        role: formData.role,
        // Só vai quando preenchida: ausente, a edição mantém a senha atual.
        ...(entraNoSistema && password ? { password } : {}),
        // `isActive` NÃO viaja daqui: desativar e ativar são o botão da linha,
        // em Ações (`useUsers.handleAlternarAtivo`), o mesmo padrão das outras
        // listas. Quem nasce, nasce ativo — o `strictObject` do create recusa o
        // campo.
      });
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
            <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors" />
          </div>

          <div className="space-y-1">
            <label className="text-text-secondary uppercase tracking-widest text-[10px]">E-mail*</label>
            <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors" />
          </div>

          <div className="space-y-1">
            <label htmlFor="role" className="text-text-secondary uppercase tracking-widest text-[10px]">Cargo</label>
            {/* `<select>` nativo e não `ReferenceSelect`: os três valores vêm do
                CÓDIGO (o enum `Cargo`), não de uma tabela — não há rota de opções
                a consultar, e inventar uma seria uma requisição para uma
                constante.

                O servidor exige `ADMIN` em `PUT /api/users/:id` e recusa (409)
                rebaixar o último administrador que entra — esta tela não repete
                nenhuma das duas regras, só oferece o campo. */}
            <select
              id="role"
              value={formData.role}
              onChange={(evento) => setFormData({ ...formData, role: evento.target.value as typeof formData.role })}
              className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors"
            >
              <option value="USUARIO">Usuário — só o que está no próprio nome</option>
              <option value="TECNICO">Técnico — o inventário inteiro</option>
              <option value="ADMIN">Administrador — mais gente, configuração e custo</option>
            </select>
          </div>

          {entraNoSistema && (
            <div className="space-y-1">
              <label htmlFor="password" className="text-text-secondary uppercase tracking-widest text-[10px]">
                {senhaObrigatoria ? 'Senha*' : 'Nova senha'}
              </label>
              <input
                id="password"
                type="password"
                required={senhaObrigatoria}
                autoComplete="new-password"
                value={password}
                onChange={(evento) => setPassword(evento.target.value)}
                className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors"
              />
              <p className="text-text-tertiary text-[10px] leading-relaxed">
                {senhaObrigatoria
                  ? 'É com o e-mail e esta senha que a pessoa entra no sistema. Mínimo de 12 caracteres.'
                  : 'Em branco, mantém a senha atual. Trocar encerra as sessões abertas da pessoa. Mínimo de 12 caracteres.'}
              </p>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-border-sutil">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50">
              {loading ? 'Salvando...' : 'Salvar Usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

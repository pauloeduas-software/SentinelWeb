import { useState } from 'react';
import { X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import type { User } from '../../../domain/shared/user.types';
import type { UserInput } from '../../../domain/user/user.queries';

// O FORMULÁRIO DE CADASTRO — nome, e-mail, departamento e gestor.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE A IDENTIDADE (matrícula, cargo, telefone, endereço, admissão) NÃO
// ESTÁ AQUI, apesar de a F11 tê-la criado.
//
// Este modal abre da LISTAGEM, e a listagem traz `User` — o
// `USER_LIST_SELECT` do servidor, que não tem os campos de identidade (eles
// ficam no `USER_DETAIL_SELECT`, D135). Um campo de cargo aqui abriria vazio ao
// editar e **apagaria o valor salvo** ao gravar: o clássico formulário que
// limpa o que não mostrou.
//
// Buscar o detalhe aqui resolveria o vazio e criaria outro problema — duas
// superfícies editando os mesmos nove campos, divergindo na primeira validação
// nova. Então a divisão é por onde o dado JÁ está: o que a listagem traz se
// edita aqui; o resto se edita na ficha, onde o detalhe já foi carregado.
// ═══════════════════════════════════════════════════════════════════════════

interface UserFormModalProps {
  user?: User | null;
  onClose: () => void;
  onSubmit: (data: UserInput) => Promise<void>;
}

export default function UserFormModal({ user, onClose, onSubmit }: UserFormModalProps) {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    // O ID, não o nome: o departamento virou entidade na F11 (D75). `''` é o
    // "nenhum" do `<select>`, convertido para `null` na submissão.
    departmentId: user?.department?.id || '',
    managerId: user?.managerId || '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // `'' → null`: o `<select>` sem escolha manda string vazia, e o zod do
      // servidor espera uuid ou nulo. É a mesma conversão que o
      // `ReferenceSelect` documenta para `parentId`/`managerId`.
      await onSubmit({
        name: formData.name,
        email: formData.email,
        departmentId: formData.departmentId || null,
        managerId: formData.managerId || null,
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
            <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors" placeholder="Ex: João da Silva" />
          </div>

          <div className="space-y-1">
            <label className="text-text-secondary uppercase tracking-widest text-[10px]">E-mail*</label>
            <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors" placeholder="Ex: joao@empresa.com" />
          </div>

          <div className="space-y-1">
            <label className="text-text-secondary uppercase tracking-widest text-[10px]">Departamento</label>
            {/* `ReferenceSelect` e não um campo de texto: departamento é
                entidade desde a F11 (D75), e texto livre é o que produziu
                `Comercial`, `comercial ` e `COMERCIAL` como três coisas na base
                que o backfill da migração teve de revisar à mão. */}
            <ReferenceSelect
              rota="departments"
              valor={formData.departmentId}
              onChange={(valor) => setFormData({ ...formData, departmentId: valor })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-text-secondary uppercase tracking-widest text-[10px]">Gestor</label>
            {/* QUEM COBRA a pessoa — nunca quem responde pelo ativo dela (D72).
                `excluirId` para ninguém ser gestor de si mesmo. */}
            <ReferenceSelect
              rota="users"
              valor={formData.managerId}
              excluirId={user?.id}
              onChange={(valor) => setFormData({ ...formData, managerId: valor })}
            />
          </div>

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

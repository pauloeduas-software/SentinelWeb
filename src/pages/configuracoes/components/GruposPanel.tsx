import { Lock, Pencil, Trash2, Users } from 'lucide-react';
import type { Grupo } from '../../../domain/shared/access.types';

interface Props {
  grupos: Grupo[];
  carregando: boolean;
  onEditar: (grupo: Grupo) => void;
  onApagar: (grupo: Grupo) => void;
}

/**
 * A tabela de grupos.
 *
 * A COLUNA DE MEMBROS É O QUE PROTEGE DE APAGAR O ERRADO. Não há `Restrict` no
 * banco (a N:M é `Cascade`, e é o certo: o vínculo não significa nada sem o
 * grupo), então o que impede o clique errado é ver "14 pessoas" antes de
 * clicar — mais o 409 de "nunca sem administrador", que é a rede e não o aviso.
 */
export default function GruposPanel({ grupos, carregando, onEditar, onApagar }: Props) {
  if (carregando) {
    return (
      <p className="p-8 text-center font-mono text-xs uppercase tracking-widest text-text-tertiary">
        Carregando...
      </p>
    );
  }

  if (grupos.length === 0) {
    return (
      <p className="border border-border-sutil p-8 text-center font-mono text-xs text-text-tertiary">
        Nenhum grupo. Quem não está em grupo nenhum entra no sistema e não alcança nada.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border border-border-sutil bg-surface-card">
      <table className="w-full min-w-[640px] text-left font-mono text-xs">
        <thead className="border-b border-border-sutil text-[10px] uppercase tracking-widest text-text-tertiary">
          <tr>
            <th className="px-4 py-3">Grupo</th>
            <th className="px-4 py-3">Permissões</th>
            <th className="px-4 py-3">Membros</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((grupo) => {
            const quantas = Object.values(grupo.permissions).filter(Boolean).length;
            return (
              <tr key={grupo.id} className="border-b border-border-sutil/50 last:border-0">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 text-text-primary">
                    {grupo.isSystem && <Lock size={12} className="shrink-0 text-status-warning" />}
                    {grupo.name}
                  </span>
                  {grupo.description && (
                    <span className="mt-0.5 block text-[10px] text-text-tertiary">{grupo.description}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary">{quantas}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <Users size={12} /> {grupo._count.users}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {/* EDITAR existe até no grupo de sistema: ver o que ele
                        concede é útil, e o modal mostra as caixas
                        desabilitadas. O que a API recusa é SALVAR a mudança. */}
                    <button
                      type="button"
                      onClick={() => onEditar(grupo)}
                      title={grupo.isSystem ? 'Ver permissões (grupo de sistema)' : 'Editar'}
                      className="p-2 text-text-tertiary transition-colors hover:text-text-primary"
                    >
                      <Pencil size={14} />
                    </button>
                    {/* APAGAR nem aparece no de sistema: a API responde 409, e
                        oferecer o clique para receber a recusa é pior do que
                        não oferecer. */}
                    {!grupo.isSystem && (
                      <button
                        type="button"
                        onClick={() => onApagar(grupo)}
                        title="Excluir"
                        className="p-2 text-text-tertiary transition-colors hover:text-status-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

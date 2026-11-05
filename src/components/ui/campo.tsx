import { useContext, useId, type ReactNode } from 'react';
import { cn } from '../../helpers/cn.helper';
import { CampoContext } from './campo.context';

// UM CAMPO DE FORMULÁRIO: rótulo, controle e ajuda.
//
// O `htmlFor` vem do contexto: `Input`, `Textarea` e `Seletor` leem o id daqui,
// e o rótulo fica ligado ao controle sem cada formulário inventar um id.

interface CampoProps {
  rotulo: ReactNode;
  obrigatorio?: boolean;
  /** A linha de explicação embaixo do controle. */
  ajuda?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Campo({ rotulo, obrigatorio, ajuda, className, children }: CampoProps) {
  const id = useId();
  return (
    <CampoContext.Provider value={id}>
      <div className={cn('space-y-1.5', className)}>
        <label htmlFor={id} className="block text-sm font-medium text-text-primary">
          {rotulo}{obrigatorio && <span aria-hidden="true" className="text-status-danger"> *</span>}
        </label>
        {children}
        {ajuda && <p className="text-xs leading-relaxed text-text-tertiary">{ajuda}</p>}
      </div>
    </CampoContext.Provider>
  );
}

/** O id do `Campo` em volta; o `id` explícito de quem chama ganha dele. */
export function useIdDoCampo(id?: string): string | undefined {
  const doCampo = useContext(CampoContext);
  return id ?? doCampo ?? undefined;
}

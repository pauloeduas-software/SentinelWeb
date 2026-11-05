import { iniciais } from '../../helpers/format.helper';
import { cn } from '../../helpers/cn.helper';

// O AVATAR SÓ COM AS INICIAIS: não há foto no Sentinel, e o círculo é o que faz a
// pessoa ser achada de relance numa lista.
export function Avatar({ nome, className }: { nome: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex size-9 shrink-0 select-none items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground', className)}
    >
      {iniciais(nome)}
    </span>
  );
}

import { cn } from '../helpers/cn.helper';
import { useTema } from '../hooks/useTema';

/** A marca: a torre do Sentinel, com uma arte para cada tema. */
export default function SentinelLogo({ className }: { className?: string }) {
  const tema = useTema((estado) => estado.tema);

  return (
    <img
      src={tema === 'escuro' ? '/torre-sem-fundo-dark.svg' : '/torre-sem-fundo-light.svg'}
      alt=""
      draggable={false}
      className={cn('size-7 shrink-0', className)}
    />
  );
}

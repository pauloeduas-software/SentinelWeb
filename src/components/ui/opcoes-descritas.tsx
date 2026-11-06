import { useId } from 'react';
import { cn } from '../../helpers/cn.helper';

// A ESCOLHA ENTRE OPÇÕES PARECIDAS: cada uma com a sua explicação à vista, para
// comparar sem selecionar uma por uma. É para lista curta e fixa, como os tipos de
// categoria e de status; lista longa vai no `Seletor`.

interface OpcaoDescrita {
  value: string;
  label: string;
  ajuda?: string;
}

interface OpcoesDescritasProps {
  /** O nome do grupo para o leitor de tela: o rótulo do `Campo` não alcança um grupo de rádios. */
  rotulo: string;
  opcoes: readonly OpcaoDescrita[];
  value: string;
  onChange: (valor: string) => void;
  disabled?: boolean;
}

export function OpcoesDescritas({ rotulo, opcoes, value, onChange, disabled = false }: OpcoesDescritasProps) {
  const grupo = useId();

  return (
    <div role="radiogroup" aria-label={rotulo} className="space-y-2">
      {opcoes.map((opcao) => {
        const escolhida = value === opcao.value;
        const idDaAjuda = `${grupo}-${opcao.value}`;
        return (
          <label
            key={opcao.value}
            className={cn(
              'flex items-start gap-3 rounded-md border p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              escolhida ? 'border-primary' : 'border-border-sutil',
              !escolhida && !disabled && 'hover:border-border-hover',
            )}
          >
            <input
              type="radio"
              name={grupo}
              value={opcao.value}
              checked={escolhida}
              disabled={disabled}
              onChange={() => onChange(opcao.value)}
              aria-label={opcao.label}
              aria-describedby={opcao.ajuda ? idDaAjuda : undefined}
              className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-none"
            />
            <span className="min-w-0 text-sm">
              <span className="block font-medium text-text-primary">{opcao.label}</span>
              {opcao.ajuda && (
                <span id={idDaAjuda} className="mt-0.5 block leading-relaxed text-text-secondary">{opcao.ajuda}</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

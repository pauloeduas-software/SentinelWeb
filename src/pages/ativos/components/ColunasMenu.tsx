import { useEffect, useRef, useState } from 'react';
import { Columns3, RotateCcw } from 'lucide-react';
import type { ColunaDeAtivo } from '../helpers/asset-columns';

// O MENU DE COLUNAS (F10, Etapa B).
//
// Dropdown e não modal: a escolha é de uma linha e o resultado aparece atrás —
// um modal cobriria justamente a tabela que a pessoa está ajustando.
//
// A preferência é do NAVEGADOR (`asset.store.ts`), e o texto no pé do menu diz
// isso. Sem a frase, a primeira suposição de quem usa duas máquinas é que a
// escolha some sozinha.

interface Props {
  catalogo: readonly ColunaDeAtivo[];
  visiveis: readonly string[];
  personalizado: boolean;
  onAlternar: (token: string) => void;
  onRestaurar: () => void;
}

export default function ColunasMenu({
  catalogo, visiveis, personalizado, onAlternar, onRestaurar,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha no clique de fora. `mousedown` e não `click`: com `click`, o próprio
  // clique que abriu o menu chegaria ao documento depois e o fecharia na hora.
  useEffect(() => {
    if (!aberto) return;

    const aoClicar = (evento: MouseEvent) => {
      if (!caixa.current?.contains(evento.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', aoClicar);
    return () => document.removeEventListener('mousedown', aoClicar);
  }, [aberto]);

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((estava) => !estava)}
        title="Escolher colunas"
        className={`flex items-center gap-2 px-3 py-2 border font-mono text-[10px] uppercase tracking-widest transition-colors ${
          aberto
            ? 'border-text-secondary text-text-primary'
            : 'border-border-sutil text-text-tertiary hover:text-text-primary hover:border-text-secondary'
        }`}
      >
        <Columns3 size={12} /> Colunas
        <span className="text-text-tertiary">{visiveis.length}</span>
      </button>

      {aberto && (
        <div className="absolute right-0 mt-1 z-30 w-64 bg-surface-card border border-border-sutil shadow-xl font-mono">
          <ul className="max-h-80 overflow-auto py-1">
            {catalogo.map((coluna) => {
              const marcada = visiveis.includes(coluna.token);
              return (
                <li key={coluna.token}>
                  <label
                    className={`flex items-center gap-3 px-3 py-2 text-xs transition-colors ${
                      coluna.fixa ? 'opacity-50 cursor-not-allowed' : 'hover:bg-bg-base cursor-pointer'
                    }`}
                    title={coluna.fixa ? 'A etiqueta identifica a linha e não pode ser escondida.' : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      disabled={coluna.fixa}
                      onChange={() => onAlternar(coluna.token)}
                      className="accent-status-info w-3.5 h-3.5"
                    />
                    <span className={marcada ? 'text-text-primary' : 'text-text-tertiary'}>
                      {coluna.rotulo}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-border-sutil px-3 py-2 space-y-2">
            <button
              type="button"
              disabled={!personalizado}
              onClick={onRestaurar}
              className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-40 disabled:hover:text-text-tertiary"
            >
              <RotateCcw size={11} /> Restaurar padrão
            </button>
            <p className="text-[10px] text-text-tertiary leading-relaxed">
              A escolha vale só neste navegador. As colunas criadas em
              Configurações › Campos aparecem sozinhas quando marcadas como coluna.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

import { Boxes } from 'lucide-react';
import { ABAS, type AbaId } from '../helpers/abas.helper';

// A barra de abas. A LISTA está em `helpers/abas.helper.ts` — aqui só se
// desenha, e as de fase futura são botões desabilitados com o nome da fase.

interface AssetTabsProps {
  ativa: AbaId;
  onChange: (aba: AbaId) => void;
}

export default function AssetTabs({ ativa, onChange }: AssetTabsProps) {
  return (
    <div className="flex flex-wrap border border-border-sutil font-mono text-xs shrink-0">
      {ABAS.map((aba) => {
        const indisponivel = aba.fase !== null;

        return (
          <button
            key={aba.id}
            type="button"
            disabled={indisponivel}
            // `title` e não um aviso ao clicar: a explicação aparece onde o
            // cursor já está, e some junto com o `fase` quando a fase chegar.
            title={indisponivel ? `Disponível na ${aba.fase}` : undefined}
            onClick={() => onChange(aba.id)}
            className={`flex items-center gap-2 px-4 py-2 uppercase tracking-widest transition-colors ${
              indisponivel
                ? 'text-text-tertiary/50 cursor-not-allowed'
                : aba.id === ativa
                  ? 'bg-text-primary text-bg-base'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
            }`}
          >
            <aba.icone size={14} /> {aba.rotulo}
            {indisponivel && (
              <span className="text-[9px] normal-case tracking-normal">({aba.fase})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** O que uma aba de fase futura mostra no lugar de uma tabela vazia. */
export function AbaFutura({ rotulo, fase }: { rotulo: string; fase: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-text-tertiary font-mono text-xs gap-3">
      <Boxes size={24} className="opacity-50" />
      <span>{rotulo} chega na {fase}.</span>
      <span className="text-[10px] max-w-md text-center leading-relaxed">
        A aba nasce agora, desabilitada, para a moldura da tela não mudar quando a fase chegar —
        e para tabela vazia não ser confundida com defeito.
      </span>
    </div>
  );
}

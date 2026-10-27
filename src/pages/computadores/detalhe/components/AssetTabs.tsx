import { ABAS, type AbaId } from '../helpers/abas.helper';

// A barra de abas. A LISTA está em `helpers/abas.helper.ts` — aqui só se desenha.

interface AssetTabsProps {
  ativa: AbaId;
  onChange: (aba: AbaId) => void;
}

export default function AssetTabs({ ativa, onChange }: AssetTabsProps) {
  return (
    <div className="flex flex-wrap border border-border-sutil font-mono text-xs shrink-0">
      {ABAS.map((aba) => (
        <button
          key={aba.id}
          type="button"
          onClick={() => onChange(aba.id)}
          className={`flex items-center gap-2 px-4 py-2 uppercase tracking-widest transition-colors ${
            aba.id === ativa
              ? 'bg-text-primary text-bg-base'
              : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
          }`}
        >
          <aba.icone size={14} /> {aba.rotulo}
        </button>
      ))}
    </div>
  );
}

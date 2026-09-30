// UM NÚMERO GRANDE COM RÓTULO — o *stat tile* dos relatórios.
//
// Existe como componente porque as quatro abas mostram a mesma coisa, e porque um
// número que muda de tamanho entre abas parece outro tipo de dado. O valor NÃO usa
// cor por padrão: cor num número é significado, e a maioria destes é neutra.

interface Props {
  rotulo: string;
  valor: string;
  /** Só quando o número CARREGA um estado (verde para valor, âmbar para pendência). */
  cor?: string;
  nota?: string;
}

export default function Indicador({ rotulo, valor, cor, nota }: Props) {
  return (
    <div className="border border-border-sutil bg-surface-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-text-tertiary">{rotulo}</div>
      <div className="text-lg mt-1" style={cor ? { color: cor } : undefined}>{valor}</div>
      {nota && <div className="text-[10px] text-text-tertiary mt-1">{nota}</div>}
    </div>
  );
}

import type { LucideIcon } from 'lucide-react';
import { Segmentado } from './ui/segmentado';
import { ContagemDaAba } from './ui/tabs';

// AS VISTAS DE UMA LISTA: Ativos, Baixados, Lixeira. Com o desenho das abas, porque
// para quem olha é a mesma coisa, sem ser aba: troca o recorte, não o painel.

export interface VistaDaLista<T> {
  valor: T;
  rotulo: string;
  icone: LucideIcon;
  contagem?: number;
}

interface VistasDaListaProps<T> {
  vistas: readonly VistaDaLista<T>[];
  valor: T;
  onChange: (valor: T) => void;
}

export default function VistasDaLista<T extends string>({ vistas, valor, onChange }: VistasDaListaProps<T>) {
  return (
    <div className="mb-4 border-b border-border-sutil">
      <Segmentado
        sublinhado
        className="-mb-px"
        valor={valor}
        onChange={onChange}
        opcoes={vistas.map(({ valor: vista, rotulo, icone: Icone, contagem }) => ({
          valor: vista,
          rotulo: (
            <>
              <Icone /> {rotulo}
              {contagem !== undefined && <ContagemDaAba>{contagem}</ContagemDaAba>}
            </>
          ),
        }))}
      />
    </div>
  );
}

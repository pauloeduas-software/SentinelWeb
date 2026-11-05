import { Segmentado } from '../../../components/ui/segmentado';
import type { StatusDoFiltro } from '../../../types/license.types';

// O FILTRO POR STATUS. Sem abas (AF): a encerrada fica na lista, e é por aqui
// que se vê só elas. "Todas" fica à vista pelo mesmo motivo do `CategoriaFiltro`:
// é o único jeito de desligar o filtro.

const OPCOES: readonly { valor: StatusDoFiltro | undefined; rotulo: string }[] = [
  { valor: undefined, rotulo: 'Todas' },
  { valor: 'ATIVA', rotulo: 'Ativas' },
  { valor: 'VENCENDO', rotulo: 'Vencendo' },
  { valor: 'EXPIRADA', rotulo: 'Vencidas' },
  { valor: 'ENCERRADA', rotulo: 'Encerradas' },
];

interface StatusFiltroProps {
  valor: StatusDoFiltro | undefined;
  onChange: (valor: StatusDoFiltro | undefined) => void;
}

export default function StatusFiltro({ valor, onChange }: StatusFiltroProps) {
  return (
    <div role="group" aria-label="Filtrar por status" className="max-w-full">
      <Segmentado opcoes={OPCOES} valor={valor} onChange={onChange} />
    </div>
  );
}

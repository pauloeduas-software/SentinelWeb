import type { StatusDoFiltro } from '../../../types/license.types';

// O FILTRO POR STATUS. Sem abas (AF): a encerrada fica na lista, e é por aqui
// que se vê só elas. Vazio é "todos", e fica no topo pelo mesmo motivo do
// `CategoriaFiltro`: é o único jeito de desligar o filtro.

const OPCOES: readonly { valor: StatusDoFiltro; rotulo: string }[] = [
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
    <select
      value={valor ?? ''}
      onChange={(evento) => onChange((evento.target.value || undefined) as StatusDoFiltro | undefined)}
      aria-label="Filtrar por status"
      className="px-3 py-2 bg-surface-card border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors"
    >
      <option value="">Todos os status</option>
      {OPCOES.map((opcao) => (
        <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
      ))}
    </select>
  );
}

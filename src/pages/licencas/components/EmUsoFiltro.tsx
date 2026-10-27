// O FILTRO DAS ENCERRADAS — aparece com o status Encerradas: todas, ou só as
// que alguém ainda usa — a lista para onde o alerta "encerradas em uso" leva,
// e de onde se devolve uma a uma.

interface EmUsoFiltroProps {
  ligado: boolean;
  onChange: (ligado: boolean) => void;
}

export default function EmUsoFiltro({ ligado, onChange }: EmUsoFiltroProps) {
  return (
    <select
      value={ligado ? 'sim' : ''}
      onChange={(evento) => onChange(evento.target.value === 'sim')}
      aria-label="Filtrar as encerradas"
      className="px-3 py-2 bg-surface-card border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors"
    >
      <option value="">Todas as encerradas</option>
      <option value="sim">Ainda em uso</option>
    </select>
  );
}

import { MapPin, PackageX, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Segmentado } from '../../../components/ui/segmentado';
import type { AssetView } from '../../../types/asset.types';

// AS VISTAS E OS FILTROS DA LISTAGEM DE ATIVOS.
//
// Não é o `ListToolbar` compartilhado, e a separação é a mesma decisão do
// servidor (D20): "Ativos / Lixeira" é genérico e vive lá; "Baixados"
// só existe no ITAM e vive aqui. Somar essa aba ao componente
// compartilhado o obrigaria a conhecer colunas que só uma tabela do sistema tem.
//
// A LINHA SOBRE OS POSTOS aparece só na vista padrão, e ela existe porque a
// ausência é a parte confusa: quem acabou de entregar um computador a uma mesa
// volta para esta tela e não o encontra. Dizer para onde ele foi, com o link,
// custa uma linha e evita a conclusão de que o sistema perdeu o ativo.

interface AssetFilterBarProps {
  view: AssetView;
  onViewChange: (view: AssetView) => void;
  /** Quantos ativos saíram do patrimônio — o contador da aba. */
  baixados: number;
  /** O nome do status filtrado, quando um contador do cabeçalho foi clicado. */
  statusFiltrado: string | null;
  onLimparStatus: () => void;
  /** A lixeira é `SUPERVISOR` no servidor (AV): sem ele, a aba não aparece. */
  comLixeira: boolean;
}

export default function AssetFilterBar({
  view, onViewChange, baixados,
  statusFiltrado, onLimparStatus, comLixeira,
}: AssetFilterBarProps) {
  const abas: { valor: AssetView; rotulo: React.ReactNode }[] = [
    { valor: 'active', rotulo: 'Ativos' },
    {
      valor: 'retired',
      rotulo: <><PackageX /> Baixados {baixados > 0 && <span className="tabular-nums">{baixados}</span>}</>,
    },
    ...(comLixeira ? [{ valor: 'trashed' as const, rotulo: <><Trash2 /> Lixeira</> }] : []),
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Segmentado opcoes={abas} valor={view} onChange={onViewChange} />

      {view === 'active' && (
        <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <MapPin className="size-4 shrink-0" />
          Computador entregue a um posto aparece em
          <Link to="/postos" className="text-primary hover:underline">Postos</Link>
        </span>
      )}

      {statusFiltrado && (
        <Button variant="outline" size="sm" onClick={onLimparStatus}>
          Status: {statusFiltrado} <X />
        </Button>
      )}
    </div>
  );
}

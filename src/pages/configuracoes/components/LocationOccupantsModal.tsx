import { Link } from 'react-router-dom';
import { Users, X } from 'lucide-react';
import OccupantsPanel from '../../components/OccupantsPanel';
import type { OccupantInput } from '../../../domain/occupancy/occupancy.queries';
import type { CatalogRow } from '../../../domain/shared/catalog.types';
import type { LocationOccupant, OccupantView } from '../../../domain/shared/posse.types';

// A janela de ocupantes da aba Localizações — moldura e identificação do posto.
//
// O MIOLO não está aqui: é o `OccupantsPanel`, compartilhado com o detalhe do
// posto em /postos. Colocar alguém na mesa é a mesma operação nas duas telas, e
// duas cópias divergiriam no primeiro ajuste.
//
// Esta porta continua existindo porque quem está editando a localização não
// deveria ter que trocar de tela para ver quem está nela. Mas ela deixou de ser
// a ÚNICA: o posto tem tela própria, e o aviso abaixo leva até lá.

interface LocationOccupantsModalProps {
  posto: CatalogRow;
  ocupantes: readonly LocationOccupant[];
  carregando: boolean;
  view: OccupantView;
  onViewChange: (view: OccupantView) => void;
  onAdicionar: (data: OccupantInput) => Promise<void>;
  onEncerrar: (ocupante: LocationOccupant) => Promise<void>;
  onClose: () => void;
}

export default function LocationOccupantsModal({
  posto, ocupantes, carregando, view, onViewChange, onAdicionar, onEncerrar, onClose,
}: LocationOccupantsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="flex items-center gap-3 text-sm font-mono text-text-primary tracking-widest uppercase">
            <Users size={16} /> Ocupantes · {posto.name}
          </h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[78vh] space-y-5">
          <p className="font-mono text-[10px] text-text-tertiary leading-relaxed">
            O posto de trabalho tem tela própria em{' '}
            <Link to="/postos" className="text-status-success hover:underline">Postos</Link>
            {' '}— com os ativos que cada mesa segura e o aviso de posto vago. Aqui está só a
            ocupação desta localização.
          </p>

          <OccupantsPanel
            ocupantes={ocupantes}
            carregando={carregando}
            view={view}
            onViewChange={onViewChange}
            onAdicionar={onAdicionar}
            onEncerrar={onEncerrar}
            onFechar={onClose}
          />
        </div>
      </div>
    </div>
  );
}

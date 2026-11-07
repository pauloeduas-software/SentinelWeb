import {
  MapPin, Undo2, User, Users,
} from 'lucide-react';
import { CartaoVazio } from '../../../../components/ListaVazia';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../helpers/cn.helper';
import { formatarData, formatarDiaDoInstante } from '../../../../helpers/format.helper';
import type { PosseResolvida } from '../../../../types/posse.types';

// A ABA RESPONSÁVEIS: quem responde pelo computador AGORA, na linha de Estoque e
// Licenças, com um item só: a pessoa, ou o posto com quem está nele embaixo (BL).
// O que já foi mora na aba Histórico (BP).
//
// O DEVOLVER MORA NESTA LINHA (BQ), e abre o painel: a devolução do computador pede
// o status de volta e as notas, que não cabem nela (BN). Entregue a um posto, a linha
// abre a ficha dele (BS): é o caminho do computador até a mesa.

const ICONE_DO_ALVO = { PERSON: User, WORKSTATION: MapPin } as const;

interface PosseTabProps {
  posse: PosseResolvida | undefined;
  /** A frase da lista vazia quando ela é vazia por causa da busca. */
  vazio?: string;
  onAbrirPosto?: () => void;
  onDevolver: () => void;
}

export default function PosseTab({ posse, vazio, onAbrirPosto, onDevolver }: PosseTabProps) {
  if (!posse?.targetType) {
    return <CartaoVazio icone={Users} carregando={false} erro={null} frase={vazio ?? 'Nenhum responsável por este computador agora.'} />;
  }

  // Cálculo fora do JSX (docs/referencia/arquitetura.md).
  const Icone = ICONE_DO_ALVO[posse.targetType];
  const quemEstaNoPosto = posse.targetType === 'WORKSTATION' ? posse.responsaveis : [];
  const periodo = [
    posse.checkoutAt && `desde ${formatarDiaDoInstante(posse.checkoutAt)}`,
    posse.expectedCheckinAt && `devolução prevista para ${formatarData(posse.expectedCheckinAt)}`,
  ].filter(Boolean).join(' · ');

  return (
    <ul className="divide-y divide-border-sutil overflow-hidden rounded-lg border border-border-sutil text-sm">
      <li
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
          onAbrirPosto && 'cursor-pointer transition-colors hover:bg-surface-muted/50',
        )}
        onClick={onAbrirPosto}
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 text-text-primary">
            <Icone className="size-4 shrink-0 text-text-tertiary" />
            <span className="truncate font-medium">{posse.targetLabel}</span>
          </div>
          {quemEstaNoPosto.map((pessoa) => (
            <div key={pessoa.id} className="truncate text-xs text-text-secondary">{pessoa.name}</div>
          ))}
          <div className="text-xs text-text-tertiary">
            {periodo}
            {posse.checkoutNotes && <span className="text-text-secondary"> · {posse.checkoutNotes}</span>}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={(evento) => {
            evento.stopPropagation();
            onDevolver();
          }}
        >
          <Undo2 /> Devolver
        </Button>
      </li>
    </ul>
  );
}

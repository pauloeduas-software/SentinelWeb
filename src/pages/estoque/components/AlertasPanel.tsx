import { Link } from 'react-router-dom';
import { PackageX, TriangleAlert } from 'lucide-react';
import type { AlertasDeEstoque } from '../../../domain/shared/stock.types';

// OS DOIS SINAIS DO ESTOQUE, e eles não são o mesmo sinal com nomes diferentes.
//
//   ESTOQUE BAIXO   o disponível caiu abaixo do piso. Falta comprar.
//   POSTO VAGO      a unidade EXISTE, está entregue a uma mesa, e não há
//                   ninguém respondendo por ela. Candidata a voltar.
//
// O segundo é o que nenhum ITAM de prateleira dá, e ele nasce de graça do
// modelo de posse: unidade com alvo `LOCATION` num posto sem ocupante aberto
// resolve para "ninguém" (docs/MODELO-POSSE.md).

interface AlertasPanelProps {
  alertas: AlertasDeEstoque;
}

export default function AlertasPanel({ alertas }: AlertasPanelProps) {
  const { estoqueBaixo, postoVago } = alertas;
  if (estoqueBaixo.length === 0 && postoVago.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 font-mono text-xs shrink-0">
      {estoqueBaixo.length > 0 && (
        <div className="border border-status-warning/30 bg-status-warning/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-status-warning uppercase tracking-widest text-[10px]">
            <TriangleAlert size={13} /> Estoque baixo ({estoqueBaixo.length})
          </div>
          <ul className="space-y-1">
            {estoqueBaixo.slice(0, 5).map((item) => (
              <li key={`${item.kind}:${item.id}`} className="flex justify-between gap-4 text-text-secondary">
                <span className="truncate">{item.name}</span>
                <span className="tabular-nums shrink-0 text-status-warning">
                  {item.disponivel} / mín. {item.minQty}
                </span>
              </li>
            ))}
          </ul>
          {estoqueBaixo.length > 5 && (
            <p className="text-text-tertiary text-[10px]">e mais {estoqueBaixo.length - 5}…</p>
          )}
        </div>
      )}

      {postoVago.length > 0 && (
        <div className="border border-border-sutil bg-surface-card p-4 space-y-2">
          <div className="flex items-center gap-2 text-text-secondary uppercase tracking-widest text-[10px]">
            <PackageX size={13} /> Parado em posto vago ({postoVago.length})
          </div>
          <ul className="space-y-1">
            {postoVago.slice(0, 5).map((unidade) => (
              <li key={unidade.checkoutId} className="flex justify-between gap-4 text-text-secondary">
                <span className="truncate">{unidade.accessoryName}</span>
                <Link
                  to="/postos"
                  className="shrink-0 text-text-tertiary hover:text-status-success transition-colors"
                >
                  {unidade.locationName}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-text-tertiary text-[10px] leading-relaxed">
            Unidade entregue a um posto que hoje não tem ocupante: ninguém responde por ela.
          </p>
        </div>
      )}
    </div>
  );
}

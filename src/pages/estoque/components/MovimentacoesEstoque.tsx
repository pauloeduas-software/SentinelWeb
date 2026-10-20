import { History } from 'lucide-react';
import type { EventoDeEstoque } from '../../../domain/shared/stock.types';
import { momentoDoEvento } from '../../helpers/historico.helper';
import { COR_DA_ACAO, ROTULO_DA_ACAO } from '../helpers/estoque.helper';

// A LINHA DO TEMPO DO ITEM — entradas, baixas, saídas e devoluções.
//
// `EventoDeEstoque` já chega pronto do servidor (`list-stock-movements.usecase.ts`):
// uma saída de lote (5 mouses para a Mesa 1) é UM evento com `qty: 5`, não
// cinco linhas — a união de saída e devolução, e o agrupamento do lote,
// acontecem na leitura, não aqui.

interface MovimentacoesEstoqueProps {
  eventos: EventoDeEstoque[];
  carregando: boolean;
}

export default function MovimentacoesEstoque({ eventos, carregando }: MovimentacoesEstoqueProps) {
  if (carregando) return <p className="text-text-tertiary">Carregando movimentação…</p>;

  if (eventos.length === 0) {
    return <p className="text-text-tertiary">Nada aconteceu com este item ainda.</p>;
  }

  return (
    <ul className="space-y-2">
      {eventos.map((evento) => (
        <li key={evento.id} className="border border-border-sutil p-3 space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className={`flex items-center gap-2 ${COR_DA_ACAO[evento.action]}`}>
              <History size={12} />
              {ROTULO_DA_ACAO[evento.action]} · {evento.qty} {evento.qty === 1 ? 'unidade' : 'unidades'}
            </span>
            <span className="text-[10px] text-text-tertiary">{momentoDoEvento(evento.at)}</span>
          </div>

          {evento.targetLabel && (
            <p className="text-[10px] text-text-secondary">
              {evento.targetType === 'PERSON' ? 'Colaborador: ' : 'Posto: '}{evento.targetLabel}
            </p>
          )}

          {evento.notes && <p className="text-[10px] text-text-tertiary">{evento.notes}</p>}
        </li>
      ))}
    </ul>
  );
}

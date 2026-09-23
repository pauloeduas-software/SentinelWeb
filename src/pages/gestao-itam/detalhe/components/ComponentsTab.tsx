import { Cpu, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { InstalacaoDeComponente } from '../../../../domain/shared/stock.types';
import { momentoDoEvento } from '../../../helpers/historico.helper';

// A ABA COMPONENTES — "o que está DENTRO deste ativo".
//
// Nasceu desabilitada na F2, dizendo "chega na Fase 5"; é esta a Fase 5. A
// moldura da tela não mudou: sumiu o `fase` da lista de abas, entrou o
// conteúdo.
//
// SÓ AS INSTALAÇÕES ABERTAS: a pergunta é de ESTADO. As peças que já saíram
// estão na aba Histórico, como `INSTALL`/`UNINSTALL`.
//
// UMA LINHA POR INSTALAÇÃO, e não uma por componente com a soma: duas
// instalações do mesmo pente em datas diferentes são dois fatos, e somá-las
// apagaria a data de entrada da segunda. O total aparece no rodapé, onde ele é
// resumo e não substitui nada.

interface ComponentsTabProps {
  instalacoes: InstalacaoDeComponente[];
  carregando: boolean;
  onRetirar: (instalacaoId: string, assignedQty: number) => void;
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

export default function ComponentsTab({ instalacoes, carregando, onRetirar }: ComponentsTabProps) {
  if (carregando) return <p className="text-text-tertiary">Carregando componentes…</p>;

  if (instalacoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary gap-3">
        <Cpu size={24} className="opacity-50" />
        <span>Nenhum componente instalado neste ativo.</span>
        <span className="text-[10px] max-w-md text-center leading-relaxed">
          Peça sem etiqueta própria — pente de RAM, HD, placa — é{' '}
          <Link to="/estoque" className="text-status-success hover:underline">componente de estoque</Link>,
          e se instala a partir de lá. Peça COM patrimônio e série é um ativo, e se prende a este
          por uma entrega de alvo "Ativo".
        </span>
      </div>
    );
  }

  const total = instalacoes.reduce((soma, linha) => soma + linha.assignedQty, 0);

  return (
    <div className="space-y-3">
      <table className="w-full">
        <thead className="border-b border-border-sutil">
          <tr>
            <th className={CABECALHO}>Componente</th>
            <th className={CABECALHO}>Categoria</th>
            <th className={`${CABECALHO} text-right`}>Unidades</th>
            <th className={CABECALHO}>Instalado em</th>
            <th className={CABECALHO}>Observações</th>
            <th className={`${CABECALHO} text-right`}></th>
          </tr>
        </thead>
        <tbody>
          {instalacoes.map((linha) => (
            <tr key={linha.id} className="border-b border-border-sutil/50 last:border-0">
              <td className="px-3 py-2 text-text-primary">
                {linha.component.name}
                {(linha.component.manufacturer || linha.component.serial) && (
                  <div className="text-[10px] text-text-tertiary mt-0.5">
                    {linha.component.manufacturer?.name}
                    {linha.component.manufacturer && linha.component.serial && ' · '}
                    {linha.component.serial && `SN ${linha.component.serial}`}
                  </div>
                )}
              </td>
              <td className="px-3 py-2">
                {linha.component.category ? (
                  // A cor vem do banco: `style`, nunca classe montada em runtime.
                  <span
                    className="px-2 py-0.5 border rounded-[2px] text-[10px] uppercase tracking-widest"
                    style={linha.component.category.color
                      ? {
                          color: linha.component.category.color,
                          borderColor: `${linha.component.category.color}33`,
                          backgroundColor: `${linha.component.category.color}1a`,
                        }
                      : undefined}
                  >
                    {linha.component.category.name}
                  </span>
                ) : <span className="text-text-tertiary">—</span>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-text-primary">{linha.assignedQty}</td>
              <td className="px-3 py-2 text-text-secondary whitespace-nowrap">
                {momentoDoEvento(linha.attachedAt)}
              </td>
              <td className="px-3 py-2 text-text-tertiary">{linha.notes ?? '—'}</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  title="Retirar do ativo"
                  onClick={() => onRetirar(linha.id, linha.assignedQty)}
                  className="p-2 text-text-tertiary hover:text-status-danger transition-colors"
                >
                  <Minus size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-text-tertiary text-[10px] leading-relaxed">
        {total} unidade(s) em {instalacoes.length} instalação(ões). Retirar em PARTE divide a
        linha: a atual fecha com a quantidade que tinha e nasce uma com o que continua aqui —
        assim "quantas peças estavam nesta máquina em março?" continua respondível.
      </p>
    </div>
  );
}

import { Edit2, Trash2, Check, Minus, Users, type LucideIcon } from 'lucide-react';
import { formatarMeses, formatarResidual, nomeDaRelacao, rotuloDoEnum } from '../../helpers/format.helper';
import type { AcaoLinhaId, AcaoLinhaSpec, ColunaSpec } from '../specs/catalog-ui.types';
import type { CatalogRow } from '../../../domain/shared/catalog.types';

// O ícone de cada ação mora AQUI, e não na spec, porque a spec é dado puro: um
// componente React dentro dela obrigaria `specs/` a importar React só para
// descrever uma tabela. O `Record` fechado garante que toda ação declarada tem
// ícone — esquecer um vira erro de tipo.
const ICONE_DA_ACAO: Record<AcaoLinhaId, LucideIcon> = {
  ocupantes: Users,
};

interface CatalogTableProps {
  colunas: readonly ColunaSpec[];
  registros: readonly CatalogRow[];
  vazio: React.ReactNode;
  /** Ações por linha da aba atual. Ausente nas seis abas que só têm CRUD. */
  acoes?: readonly AcaoLinhaSpec[];
  onEdit: (registro: CatalogRow) => void;
  onDelete: (registro: CatalogRow) => void;
  onAcao?: (id: AcaoLinhaId, registro: CatalogRow) => void;
}

export default function CatalogTable({
  colunas, registros, vazio, acoes, onEdit, onDelete, onAcao,
}: CatalogTableProps) {
  return (
    <div className="bg-surface-card border border-border-sutil flex-1 overflow-auto">
      <table className="w-full text-left font-mono text-xs whitespace-nowrap">
        <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest sticky top-0 z-10">
          <tr>
            {colunas.map((coluna) => (
              <th key={coluna.key} className="px-6 py-4 font-normal">{coluna.label}</th>
            ))}
            <th className="px-6 py-4 font-normal text-right">Ações</th>
          </tr>
        </thead>

        <tbody className="text-text-primary divide-y divide-border-sutil/50">
          {registros.map((registro) => (
            <tr key={registro.id} className="hover:bg-bg-base transition-colors group">
              {colunas.map((coluna) => (
                <td key={coluna.key} className="px-6 py-4 text-text-secondary">
                  <Celula coluna={coluna} registro={registro} />
                </td>
              ))}
              <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Antes de editar/excluir vêm as ações da spec. Aba sem
                      `acoes` não renderiza nada aqui — as seis outras seguem
                      idênticas ao que eram. */}
                  {acoes?.map((acao) => {
                    const Icone = ICONE_DA_ACAO[acao.id];
                    return (
                      <button
                        key={acao.id}
                        onClick={() => onAcao?.(acao.id, registro)}
                        title={acao.titulo}
                        className="text-text-tertiary hover:text-status-info transition-colors"
                      >
                        <Icone size={14} />
                      </button>
                    );
                  })}
                  <button
                    onClick={() => onEdit(registro)}
                    title="Editar"
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(registro)}
                    title="Excluir"
                    className="text-text-tertiary hover:text-status-danger transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {registros.length === 0 && (
            <tr>
              <td colSpan={colunas.length + 1} className="px-6 py-16 text-center text-text-tertiary">
                {vazio}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Celula({ coluna, registro }: { coluna: ColunaSpec; registro: CatalogRow }) {
  const valor = registro[coluna.key];

  switch (coluna.render) {
    case 'cor':
      return (
        <span className="flex items-center gap-2 text-text-primary">
          {/* A cor vem do BANCO, então vai por `style`. O Tailwind gera CSS a
              partir do que está escrito no fonte — uma classe montada com
              string de runtime não existiria no bundle. */}
          <span
            className="w-2 h-2 rounded-full shrink-0 border border-border-sutil"
            style={typeof valor === 'string' && registro.color ? { backgroundColor: String(registro.color) } : undefined}
          />
          {String(registro.name)}
        </span>
      );

    case 'enum':
      return <span>{rotuloDoEnum(valor, coluna.opcoes)}</span>;

    case 'relacao':
      return <span>{nomeDaRelacao(valor)}</span>;

    case 'booleano':
      return valor
        ? <Check size={14} className="text-status-success" />
        : <Minus size={14} className="text-text-tertiary" />;

    case 'meses':
      return <span className="tabular-nums">{formatarMeses(valor)}</span>;

    case 'moeda':
      return <span className="tabular-nums">{formatarResidual(valor, registro[coluna.campoTipo ?? ''])}</span>;

    default:
      return <span>{valor == null || valor === '' ? '—' : String(valor)}</span>;
  }
}

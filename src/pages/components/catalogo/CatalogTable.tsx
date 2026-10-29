import { Edit2, FileText, RotateCcw, Trash2, Power, PowerOff, type LucideIcon } from 'lucide-react';
import { nomeDaRelacao, rotuloDoEnum } from '../../helpers/format.helper';
import type { AcaoLinhaId, AcaoLinhaSpec, ColunaSpec } from './catalog-ui.types';
import type { CatalogRow } from '../../../domain/shared/catalog.types';

// O ícone de cada ação mora AQUI, e não na spec, porque a spec é dado puro: um
// componente React dentro dela obrigaria `specs/` a importar React só para
// descrever uma tabela. O `Record` fechado garante que toda ação declarada tem
// ícone — esquecer um vira erro de tipo.
//
// A ação que ALTERNA tem dois ícones: o do que o clique FAZ (desligar quando
// está ligado, ligar quando está desligado).
const ICONE_DA_ACAO: Record<AcaoLinhaId, LucideIcon> = {
  ativacao: PowerOff,
  ficha: FileText,
};
const ICONE_SE_DESLIGADO: Partial<Record<AcaoLinhaId, LucideIcon>> = {
  ativacao: Power,
};

/** A linha está com o campo da ação de alternar desligado? (`false`, não ausente.) */
function desligada(registro: CatalogRow, acoes?: readonly AcaoLinhaSpec[]): AcaoLinhaSpec | undefined {
  return acoes?.find((acao) => acao.alterna && registro[acao.alterna.campo] === false);
}

interface CatalogTableProps {
  colunas: readonly ColunaSpec[];
  registros: readonly CatalogRow[];
  vazio: React.ReactNode;
  /** Ações por linha da aba, além de editar e excluir (Desativar e Ficha, em Colaboradores). */
  acoes?: readonly AcaoLinhaSpec[];
  onEdit: (registro: CatalogRow) => void;
  onDelete: (registro: CatalogRow) => void;
  onAcao?: (id: AcaoLinhaId, registro: CatalogRow) => void;
  /**
   * A LIXEIRA está na tela: a linha oferece só Restaurar. Editar, desativar e
   * excluir um registro que está na lixeira não existem — o servidor responde
   * 404 —, então o botão nem aparece.
   */
  onRestore?: (registro: CatalogRow) => void;
}

export default function CatalogTable({
  colunas, registros, vazio, acoes, onEdit, onDelete, onAcao, onRestore,
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
          {registros.map((registro) => {
            const apagada = desligada(registro, acoes);
            return (
              <tr key={registro.id} className={`hover:bg-bg-base transition-colors group ${apagada ? 'opacity-60' : ''}`}>
                {colunas.map((coluna, indice) => (
                  <td key={coluna.key} className="px-6 py-4 text-text-secondary">
                    <Celula coluna={coluna} registro={registro} />
                    {/* A marca vai na PRIMEIRA coluna, ao lado do nome: é onde o
                        olho está ao procurar a linha. */}
                    {indice === 0 && apagada?.alterna && (
                      <span className="ml-3 text-[10px] text-status-warning uppercase tracking-widest">
                        {apagada.alterna.marcaSeDesligado}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-6 py-4 text-right">
                  {/* Visível ao passar o mouse, ao navegar por Tab (`focus-within`)
                      e sempre no toque, onde não há hover. */}
                  <div className="flex items-center justify-end gap-3 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                    {onRestore ? (
                      <button
                        onClick={() => onRestore(registro)}
                        title="Restaurar"
                        aria-label={`Restaurar ${String(registro.name ?? '')}`}
                        className="text-text-tertiary hover:text-status-success transition-colors"
                      >
                        <RotateCcw size={14} />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => onEdit(registro)}
                          title="Editar"
                          aria-label={`Editar ${String(registro.name ?? '')}`}
                          className="text-text-tertiary hover:text-text-primary transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        {/* A ordem é Editar, as ações da spec (Desativar, Ficha) e
                            Excluir por último — o destrutivo fica na ponta. */}
                        {acoes?.map((acao) => {
                          const desligado = acao.alterna && registro[acao.alterna.campo] === false;
                          const Icone = (desligado && ICONE_SE_DESLIGADO[acao.id]) || ICONE_DA_ACAO[acao.id];
                          const titulo = desligado ? acao.alterna?.tituloSeDesligado : acao.titulo;
                          return (
                            <button
                              key={acao.id}
                              onClick={() => onAcao?.(acao.id, registro)}
                              title={titulo}
                              aria-label={`${titulo ?? ''} ${String(registro.name ?? '')}`}
                              className="text-text-tertiary hover:text-status-info transition-colors"
                            >
                              <Icone size={14} />
                            </button>
                          );
                        })}
                        <button
                          onClick={() => onDelete(registro)}
                          title="Excluir"
                          aria-label={`Excluir ${String(registro.name ?? '')}`}
                          className="text-text-tertiary hover:text-status-danger transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

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
    case 'enum':
      return <span>{rotuloDoEnum(valor, coluna.opcoes)}</span>;

    case 'relacao':
      return <span>{nomeDaRelacao(valor)}</span>;

    default:
      return <span>{valor == null || valor === '' ? '—' : String(valor)}</span>;
  }
}

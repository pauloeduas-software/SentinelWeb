import { CheckCircle2, Edit2, ShieldCheck, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Manutencao } from '../../../domain/shared/lifecycle.types';
import { formatarData, formatarMoeda } from '../../helpers/format.helper';
import {
  corDaSituacao, identificacaoDoAtivo, rotuloDoTipo, textoDaSituacao,
} from '../helpers/manutencao.helper';

// A tabela de manutenções. Apresentacional puro: recebe valor e callback, não
// conhece query nem HTTP.
//
// A COLUNA PRINCIPAL É A SITUAÇÃO, não o tipo: a pergunta que traz alguém a esta
// tela é "o que ainda está aberto", e o tipo só importa depois de escolhida a
// linha. É por isso que a situação carrega o TEMPO ("aberta há 23 dias") em vez
// de um selo binário — 23 dias é a informação que faz alguém agir.

interface Props {
  manutencoes: Manutencao[];
  onEditar: (manutencao: Manutencao) => void;
  onEncerrar: (manutencao: Manutencao) => void;
  onExcluir: (manutencao: Manutencao) => void;
  vazio: React.ReactNode;
}

const CABECALHO = 'px-4 py-3 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

export default function ManutencaoTable({
  manutencoes, onEditar, onEncerrar, onExcluir, vazio,
}: Props) {
  if (manutencoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary font-mono text-xs gap-3 border border-border-sutil bg-surface-card">
        {vazio}
      </div>
    );
  }

  return (
    <div className="border border-border-sutil bg-surface-card overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead className="border-b border-border-sutil bg-bg-base/40">
          <tr>
            <th className={CABECALHO}>Ativo</th>
            <th className={CABECALHO}>Serviço</th>
            <th className={CABECALHO}>Tipo</th>
            <th className={CABECALHO}>Situação</th>
            <th className={CABECALHO}>Abertura</th>
            <th className={CABECALHO}>Fornecedor</th>
            <th className={`${CABECALHO} text-right`}>Custo</th>
            <th className={`${CABECALHO} text-right`}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {manutencoes.map((manutencao) => (
            <tr
              key={manutencao.id}
              className="border-b border-border-sutil/50 last:border-0 hover:bg-bg-base/40 transition-colors"
            >
              <td className="px-4 py-3">
                <Link
                  to={`/ativos/${manutencao.assetId}`}
                  className="text-text-primary hover:text-status-success transition-colors"
                >
                  {identificacaoDoAtivo(manutencao)}
                </Link>
              </td>

              <td className="px-4 py-3 text-text-secondary max-w-xs truncate" title={manutencao.title}>
                {manutencao.title}
              </td>

              <td className="px-4 py-3 text-text-tertiary">{rotuloDoTipo(manutencao.type)}</td>

              <td className="px-4 py-3">
                <span style={{ color: corDaSituacao(manutencao) }}>{textoDaSituacao(manutencao)}</span>
                {manutencao.completionDate && (
                  <div className="text-[10px] text-text-tertiary mt-1">
                    em {formatarData(manutencao.completionDate)}
                  </div>
                )}
              </td>

              <td className="px-4 py-3 text-text-tertiary">{formatarData(manutencao.startDate)}</td>

              <td className="px-4 py-3 text-text-tertiary">{manutencao.supplier?.name ?? '—'}</td>

              <td className="px-4 py-3 text-right">
                <span className="text-text-primary">{formatarMoeda(manutencao.cost)}</span>
                {manutencao.isWarranty && (
                  // O selo precisa estar na LISTAGEM: é ele que explica por que uma
                  // linha com serviço feito tem custo zero ou vazio.
                  <div className="flex items-center justify-end gap-1 text-[10px] text-status-success mt-1">
                    <ShieldCheck size={10} /> garantia
                  </div>
                )}
              </td>

              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  {manutencao.emAberto && (
                    <Acao titulo="Encerrar" onClick={() => onEncerrar(manutencao)} icone={CheckCircle2} />
                  )}
                  <Acao titulo="Editar" onClick={() => onEditar(manutencao)} icone={Edit2} />
                  <Acao titulo="Apagar" onClick={() => onExcluir(manutencao)} icone={Trash2} perigo />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface AcaoProps {
  titulo: string;
  onClick: () => void;
  icone: typeof Edit2;
  perigo?: boolean;
}

function Acao({ titulo, onClick, icone: Icone, perigo }: AcaoProps) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      className={`p-2 transition-colors ${
        perigo
          ? 'text-text-tertiary hover:text-status-danger'
          : 'text-text-tertiary hover:text-text-primary'
      }`}
    >
      <Icone size={13} />
    </button>
  );
}

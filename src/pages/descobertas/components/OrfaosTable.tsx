import { Check, Ban, HelpCircle } from 'lucide-react';
import type { Endpoint } from '../../../domain/shared/endpoint.types';
import type { ReviewState } from '../../../domain/shared/reconciliation.types';

// AS MÁQUINAS QUE O AGENTE VÊ E O CADASTRO NÃO CONHECE — o Shadow IT.
//
// A triagem não MEXE na máquina: `ALLOWED` é "eu sei o que é isso", `BLOCKED` é
// "isto não deveria estar na rede". Nenhum dos dois desliga ninguém
// remotamente — o comando remoto existe, é outra tela, e é uma decisão humana
// explícita.
//
// O valor da triagem é tirar da fila o que já foi olhado: sem ela, a mesma
// máquina conhecida reaparece como "não autorizada" toda semana, e o alerta que
// repete é o alerta que ninguém lê.

interface Props {
  orfaos: Endpoint[];
  ocupado: boolean;
  onTriar: (id: string, reviewState: ReviewState) => void;
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

const SITUACAO: Record<ReviewState, { rotulo: string; cor: string }> = {
  UNREVIEWED: { rotulo: 'Sem triagem', cor: 'text-status-warning' },
  ALLOWED: { rotulo: 'Conhecida', cor: 'text-status-success' },
  BLOCKED: { rotulo: 'Não autorizada', cor: 'text-status-danger' },
};

export default function OrfaosTable({ orfaos, ocupado, onTriar }: Props) {
  if (orfaos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary gap-3 border border-border-sutil">
        <HelpCircle size={24} className="opacity-50" />
        <span>Nenhuma máquina sem cadastro.</span>
        <span className="text-[10px] max-w-md text-center leading-relaxed">
          Toda máquina que o agente descobriu já tem um ativo correspondente.
        </span>
      </div>
    );
  }

  return (
    <table className="w-full border border-border-sutil text-xs font-mono">
      <thead className="bg-bg-surface border-b border-border-sutil">
        <tr>
          <th className={CABECALHO}>Máquina</th>
          <th className={CABECALHO}>Sistema</th>
          <th className={CABECALHO}>Série</th>
          <th className={CABECALHO}>Último contato</th>
          <th className={CABECALHO}>Situação</th>
          <th className={CABECALHO}>Triagem</th>
        </tr>
      </thead>
      <tbody>
        {orfaos.map((orfao) => {
          const situacao = SITUACAO[orfao.reviewState ?? 'UNREVIEWED'];
          return (
            <tr key={orfao.id} className="border-b border-border-sutil last:border-0">
              <td className="px-3 py-2 text-text-primary">{orfao.hostname}</td>
              <td className="px-3 py-2 text-text-secondary">{orfao.osVersion}</td>
              <td className="px-3 py-2 text-text-tertiary">{orfao.biosSerial ?? '—'}</td>
              <td className="px-3 py-2 text-text-tertiary">
                {new Date(orfao.lastSeen).toLocaleString('pt-BR')}
              </td>
              <td className={`px-3 py-2 ${situacao.cor}`}>{situacao.rotulo}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => onTriar(orfao.id, 'ALLOWED')}
                    className="p-1.5 text-status-success hover:bg-status-success/10 disabled:opacity-30 transition-colors"
                    title="Conheço esta máquina"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => onTriar(orfao.id, 'BLOCKED')}
                    className="p-1.5 text-status-danger hover:bg-status-danger/10 disabled:opacity-30 transition-colors"
                    title="Não deveria estar na rede"
                  >
                    <Ban size={14} />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

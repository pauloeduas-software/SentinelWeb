import { Fragment, useState } from 'react';
import { Check, Ban, HelpCircle, Link2 } from 'lucide-react';
import VincularMaquinaForm from './VincularMaquinaForm';
import type { Endpoint } from '../../../domain/shared/endpoint.types';
import type { ReviewState } from '../../../domain/shared/reconciliation.types';

// AS MÁQUINAS QUE O AGENTE VÊ E O CADASTRO NÃO CONHECE — o Shadow IT, e o
// computador novo que ainda não virou patrimônio.
//
// DUAS AÇÕES por linha, e são conversas diferentes. A TRIAGEM não mexe na
// máquina: `ALLOWED` é "eu sei o que é isso", `BLOCKED` é "isto não deveria
// estar na rede"; o valor dela é tirar da fila o que já foi olhado, senão a
// mesma máquina conhecida reaparece como "não autorizada" toda semana. O
// VÍNCULO é o contrário: é dizer que esta máquina É um ativo — e, se quiser,
// entregá-la ao posto na mesma ida. A fila de sugestões só alcança a máquina
// que a cascata casou com alguma coisa; a que chegou com serial em branco e um
// nome que não bate só sai daqui por este botão.
//
// Nenhuma das duas desliga ninguém remotamente — o comando remoto mora na ficha
// do ativo a que a máquina está vinculada, e numa máquina desta lista, por
// definição, não está.

interface Props {
  orfaos: Endpoint[];
  carregando: boolean;
  ocupado: boolean;
  onTriar: (id: string, reviewState: ReviewState) => void;
  onVincular: (endpointId: string, assetId: string, targetWorkstationId: string | null) => Promise<void>;
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

const SITUACAO: Record<ReviewState, { rotulo: string; cor: string }> = {
  UNREVIEWED: { rotulo: 'Sem triagem', cor: 'text-status-warning' },
  ALLOWED: { rotulo: 'Conhecida', cor: 'text-status-success' },
  BLOCKED: { rotulo: 'Não autorizada', cor: 'text-status-danger' },
};

export default function OrfaosTable({ orfaos, carregando, ocupado, onTriar, onVincular }: Props) {
  // QUAL linha está com o formulário de vínculo aberto. Um de cada vez: dois
  // formulários abertos seriam dois seletores de ativo disputando a mesma
  // lista, e a pessoa vincula uma máquina por vez.
  const [vinculando, setVinculando] = useState<string | null>(null);

  if (orfaos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary gap-3 border border-border-sutil">
        <HelpCircle size={24} className="opacity-50" />
        <span>{carregando ? 'Carregando máquinas…' : 'Nenhuma máquina sem vínculo.'}</span>
        {!carregando && (
          <span className="text-[10px] max-w-md text-center leading-relaxed">
            Toda máquina que o agente descobriu já tem um ativo correspondente.
          </span>
        )}
      </div>
    );
  }

  return (
    <table className="w-full border border-border-sutil text-xs font-mono">
      <thead className="bg-bg-base/50 border-b border-border-sutil">
        <tr>
          <th className={CABECALHO}>Máquina</th>
          <th className={CABECALHO}>Sistema</th>
          <th className={CABECALHO}>Série</th>
          <th className={CABECALHO}>Último contato</th>
          <th className={CABECALHO}>Situação</th>
          <th className={CABECALHO}>Ações</th>
        </tr>
      </thead>
      <tbody>
        {orfaos.map((orfao) => {
          const situacao = SITUACAO[orfao.reviewState ?? 'UNREVIEWED'];
          const aberto = vinculando === orfao.id;
          return (
            <Fragment key={orfao.id}>
              <tr className="border-b border-border-sutil last:border-0">
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
                      onClick={() => setVinculando(aberto ? null : orfao.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 border text-[10px] uppercase tracking-widest transition-colors disabled:opacity-30 ${
                        aberto
                          ? 'border-text-primary text-text-primary'
                          : 'border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base'
                      }`}
                      title="Esta máquina é um ativo do cadastro"
                    >
                      <Link2 size={12} /> Vincular
                    </button>
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
              {aberto && (
                <tr className="border-b border-border-sutil last:border-0">
                  <td colSpan={6} className="p-0">
                    <VincularMaquinaForm
                      maquina={orfao}
                      ocupado={ocupado}
                      onVincular={onVincular}
                      onCancelar={() => setVinculando(null)}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

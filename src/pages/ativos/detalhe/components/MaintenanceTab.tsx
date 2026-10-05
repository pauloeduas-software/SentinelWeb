import { useState } from 'react';
import { CheckCircle2, Plus, ScanSearch, ShieldCheck, Wrench } from 'lucide-react';
import ManutencaoFormModal from '../../../manutencoes/components/ManutencaoFormModal';
import type { Auditoria, Manutencao, ManutencaoInput } from '../../../../domain/shared/lifecycle.types';
import { formatarData, formatarMoeda } from '../../../helpers/format.helper';
import { rotuloDoTipo, textoDaSituacao, corDaSituacao } from '../../../manutencoes/helpers/manutencao.helper';

// A ABA MANUTENÇÕES — "o que já foi feito neste equipamento".
//
// Nasceu desabilitada na F2, dizendo "chega na Fase 8"; é esta a Fase 8. A moldura
// da tela não mudou: sumiu o `fase` da lista de abas, entrou o conteúdo.
//
// ═════════════════════════════════════════════════════════════════════════════
// DUAS LISTAS NA MESMA ABA: SERVIÇO E CONFERÊNCIA.
//
// Elas não são a mesma coisa e não viram duas abas: a aba responde "o que já se
// fez com este equipamento", e conferir se ele está onde deveria é parte disso.
// Uma nona aba só para auditoria apareceria vazia na esmagadora maioria dos
// ativos — e o custo de uma aba vazia é o que a F2 escreveu quando decidiu mostrar
// as abas de fase futura: aba vazia é indistinguível de defeito.
//
// TUDO, aberta e encerrada, sem paginação: é justamente o que já passou que
// responde "vale a pena consertar de novo?".
// ═════════════════════════════════════════════════════════════════════════════

interface Props {
  assetId: string;
  manutencoes: Manutencao[];
  auditorias: Auditoria[];
  carregando: boolean;
  onAbrir: (dados: ManutencaoInput) => Promise<void>;
  onEncerrar: (manutencaoId: string) => void;
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

/** O que o resultado da conferência quer dizer, em uma palavra e uma cor. */
const RESULTADO: Record<Auditoria['result'], { rotulo: string; cor: string }> = {
  OK: { rotulo: 'Conferido', cor: '#22c55e' },
  DIVERGENTE: { rotulo: 'Divergente', cor: '#f59e0b' },
  NAO_LOCALIZADO: { rotulo: 'Não localizado', cor: '#ef4444' },
};

export default function MaintenanceTab({
  assetId, manutencoes, auditorias, carregando, onAbrir, onEncerrar,
}: Props) {
  const [abrindo, setAbrindo] = useState(false);

  if (carregando) return <p className="text-text-tertiary">Carregando histórico de serviço…</p>;

  // Cálculo fora do JSX (docs/referencia/arquitetura.md).
  const emAberto = manutencoes.filter((manutencao) => manutencao.emAberto).length;
  const custo = manutencoes.reduce((soma, manutencao) => soma + Number(manutencao.cost ?? 0), 0);

  return (
    <div className="space-y-8">

      <section className="space-y-3">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-text-secondary">
            <Wrench size={13} />
            <span className="uppercase tracking-widest text-[10px]">Serviço</span>
            {manutencoes.length > 0 && (
              <span className="text-[10px] text-text-tertiary">
                · {manutencoes.length} registro(s){emAberto > 0 && `, ${emAberto} em aberto`}
                {custo > 0 && ` · ${formatarMoeda(String(custo))} acumulado`}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setAbrindo(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base uppercase tracking-widest text-[10px] transition-colors"
          >
            <Plus size={12} /> Abrir manutenção
          </button>
        </header>

        {manutencoes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-text-tertiary gap-3">
            <Wrench size={22} className="opacity-50" />
            <span>Nenhuma manutenção registrada neste ativo.</span>
            <span className="text-[10px] max-w-md text-center leading-relaxed">
              Reparo, upgrade, calibração e contrato de suporte entram aqui. Abrir uma
              <span className="text-text-secondary"> não muda o status do ativo</span> — para
              tirá-lo de operação, troque o rótulo de status.
            </span>
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border-sutil">
              <tr>
                <th className={CABECALHO}>Serviço</th>
                <th className={CABECALHO}>Tipo</th>
                <th className={CABECALHO}>Situação</th>
                <th className={CABECALHO}>Abertura</th>
                <th className={CABECALHO}>Fornecedor</th>
                <th className={`${CABECALHO} text-right`}>Custo</th>
                <th className={`${CABECALHO} text-right`}></th>
              </tr>
            </thead>
            <tbody>
              {manutencoes.map((manutencao) => (
                <tr key={manutencao.id} className="border-b border-border-sutil/40 last:border-0">
                  <td className="px-3 py-2 text-text-primary">
                    {manutencao.title}
                    {manutencao.notes && (
                      <div className="text-[10px] text-text-tertiary mt-1 max-w-md">{manutencao.notes}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-text-tertiary">{rotuloDoTipo(manutencao.type)}</td>
                  <td className="px-3 py-2" style={{ color: corDaSituacao(manutencao) }}>
                    {textoDaSituacao(manutencao)}
                  </td>
                  <td className="px-3 py-2 text-text-tertiary">{formatarData(manutencao.startDate)}</td>
                  <td className="px-3 py-2 text-text-tertiary">{manutencao.supplier?.name ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {formatarMoeda(manutencao.cost)}
                    {manutencao.isWarranty && (
                      <div className="flex items-center justify-end gap-1 text-[10px] text-status-success mt-1">
                        <ShieldCheck size={10} /> garantia
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {manutencao.emAberto && (
                      <button
                        type="button"
                        title="Encerrar (hoje)"
                        onClick={() => onEncerrar(manutencao.id)}
                        className="p-1.5 text-text-tertiary hover:text-status-success transition-colors"
                      >
                        <CheckCircle2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <header className="flex items-center gap-2 text-text-secondary">
          <ScanSearch size={13} />
          <span className="uppercase tracking-widest text-[10px]">Conferências</span>
        </header>

        {auditorias.length === 0 ? (
          <p className="text-text-tertiary text-[11px] leading-relaxed max-w-lg">
            Este ativo <span className="text-text-secondary">nunca foi conferido</span>. A
            conferência acontece por posto — é lá que alguém anda até a mesa e marca o que está
            lá. Máquina com agente e número de série batendo é conferida sozinha, uma vez por dia.
          </p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border-sutil">
              <tr>
                <th className={CABECALHO}>Quando</th>
                <th className={CABECALHO}>Resultado</th>
                <th className={CABECALHO}>Método</th>
                <th className={CABECALHO}>Local</th>
                <th className={CABECALHO}>Sinais</th>
              </tr>
            </thead>
            <tbody>
              {auditorias.map((auditoria) => (
                <tr key={auditoria.id} className="border-b border-border-sutil/40 last:border-0">
                  <td className="px-3 py-2 text-text-tertiary">{formatarData(auditoria.auditedAt)}</td>
                  <td className="px-3 py-2" style={{ color: RESULTADO[auditoria.result].cor }}>
                    {RESULTADO[auditoria.result].rotulo}
                  </td>
                  <td className="px-3 py-2 text-text-tertiary">
                    {auditoria.method === 'AGENTE' ? 'Agente (série confere)' : 'Manual'}
                  </td>
                  <td className="px-3 py-2 text-text-tertiary">
                    {auditoria.locationIdBefore ? (
                      <>
                        {auditoria.locationBeforeName ?? '(local removido)'} →{' '}
                        <span className="text-text-secondary">
                          {auditoria.locationFoundName ?? '(local removido)'}
                        </span>
                      </>
                    ) : (
                      auditoria.locationFoundName ?? '—'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {/* Os dois sinais que a auditoria MARCA e nunca corrige (D52). */}
                    <div className="flex flex-col gap-1 text-[10px]">
                      {auditoria.divergenciaDePosse && (
                        <span className="text-status-warning">posse divergente</span>
                      )}
                      {auditoria.postoVago && <span className="text-status-warning">posto vago</span>}
                      {!auditoria.divergenciaDePosse && !auditoria.postoVago && (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {abrindo && (
        <ManutencaoFormModal
          manutencao={null}
          assetIdFixo={assetId}
          onClose={() => setAbrindo(false)}
          onSubmit={async (_assetId, dados) => {
            await onAbrir(dados);
            setAbrindo(false);
          }}
        />
      )}
    </div>
  );
}

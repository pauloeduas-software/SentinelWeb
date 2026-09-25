import { ArrowRightLeft, MapPin, TriangleAlert, Undo2, User } from 'lucide-react';
import type { Assignment, PosseResolvida, Responsavel } from '../../../../domain/shared/posse.types';
import { formatarData } from '../../../helpers/format.helper';
import { comoChegouAoAlvo, estaAberta, rotuloDoAlvo } from '../helpers/rotulo-do-alvo.helper';

// A ABA POSSE — as três camadas do docs/MODELO-POSSE.md numa tela só:
//
//   quem responde   (Camada 3, DERIVADA — pode ser mais de um, com turno)
//   para quem foi   (Camada 1, a `Assignment` aberta)
//   o histórico     (as posses fechadas, que nunca são apagadas)
//
// O que esta tela mostra e a listagem não: o `via` de cada responsável. "Laura
// por posse direta" e "Laura por ocupar a Mesa 1" são fatos diferentes sobre o
// mesmo equipamento — o primeiro se desfaz com uma devolução, o segundo com uma
// troca de escala.

const VIA: Record<Responsavel['via'], { rotulo: string; explicacao: string }> = {
  DIRETO: {
    rotulo: 'posse direta',
    explicacao: 'O ativo está no nome dela. A devolução encerra a responsabilidade.',
  },
  POSTO: {
    rotulo: 'por ocupar o posto',
    explicacao: 'Responde porque ocupa a localização que detém o ativo. Sai da escala, sai a responsabilidade.',
  },
  ATIVO: {
    rotulo: 'pelo ativo detentor',
    explicacao: 'O ativo acompanha outro equipamento, e quem responde é quem responde por aquele.',
  },
};

interface PosseTabProps {
  posse: PosseResolvida | null;
  assignments: Assignment[];
  carregando: boolean;
  onAbrirOperacao: () => void;
}

export default function PosseTab({ posse, assignments, carregando, onAbrirOperacao }: PosseTabProps) {
  // Cálculo fora do JSX: as três perguntas da tela, respondidas uma vez.
  const entregue = posse?.assignmentId != null;
  const responsaveis = posse?.responsaveis ?? [];
  const fechadas = assignments.filter((linha) => !estaAberta(linha));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-text-tertiary uppercase tracking-widest text-[10px]">Quem responde hoje</h3>
          <p className="text-text-tertiary text-[10px] leading-relaxed max-w-xl">
            Calculado na hora a partir da posse aberta e — quando ela aponta para um posto — de quem
            ocupa esse posto. Nunca é uma coluna do ativo, e é por isso que pode ser mais de uma
            pessoa.
          </p>
        </div>
        <button
          type="button"
          onClick={onAbrirOperacao}
          className="flex items-center gap-2 px-3 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors shrink-0"
        >
          {entregue ? <Undo2 size={13} /> : <ArrowRightLeft size={13} />}
          {entregue ? 'Devolver' : 'Entregar'}
        </button>
      </div>

      {responsaveis.length === 0 ? (
        <div className="border border-border-sutil bg-bg-base/50 p-4 text-text-tertiary">
          {entregue
            ? 'Ninguém responde por ele: a posse aponta para um posto sem ocupante.'
            : 'Sem posse aberta — o ativo está no estoque.'}
        </div>
      ) : (
        <ul className="border border-border-sutil divide-y divide-border-sutil/50">
          {responsaveis.map((responsavel) => (
            <li key={`${responsavel.id}-${responsavel.via}-${responsavel.shift ?? ''}`} className="p-4 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <User size={13} className="text-text-tertiary" />
                <span className="text-text-primary">{responsavel.name}</span>
                {responsavel.shift && (
                  <span className="px-2 py-0.5 border border-border-sutil text-[10px] uppercase tracking-widest text-text-secondary">
                    {responsavel.shift}
                  </span>
                )}
                <span className="text-[10px] uppercase tracking-widest text-status-info">
                  {VIA[responsavel.via].rotulo}
                </span>
              </div>
              <div className="text-text-tertiary text-[10px]">{responsavel.email}</div>
              <div className="text-text-tertiary text-[10px] leading-relaxed">
                {VIA[responsavel.via].explicacao}
                {responsavel.locationName && ` Posto: ${responsavel.locationName}.`}
              </div>
            </li>
          ))}
        </ul>
      )}

      {entregue && (
        <div className="border border-border-sutil bg-bg-base/50 p-4 space-y-2">
          <div className="text-text-tertiary uppercase tracking-widest text-[10px]">Entregue para</div>
          <div className="flex items-center gap-2 text-text-primary">
            <MapPin size={13} className="text-text-tertiary" />
            {posse?.targetLabel ?? '—'}
            <span className="text-text-tertiary text-[10px] uppercase tracking-widest">
              {posse?.targetType}
            </span>
          </div>

          {posse?.postoVago && (
            <div className="flex items-start gap-2 text-status-warning text-[10px] leading-relaxed">
              <TriangleAlert size={12} className="mt-0.5 shrink-0" />
              <span>
                POSTO VAGO: o ativo está entregue a uma localização sem nenhum ocupante aberto —
                equipamento parado em mesa vazia. Devolva ao estoque ou coloque alguém no posto, em
                Configurações › Localizações.
              </span>
            </div>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-text-tertiary uppercase tracking-widest text-[10px] border-b border-border-sutil pb-2">
          Histórico de posse
        </h3>

        {carregando && <div className="text-text-tertiary">Carregando…</div>}

        {!carregando && assignments.length === 0 && (
          <div className="text-text-tertiary">Este ativo nunca foi entregue.</div>
        )}

        <ul className="space-y-2">
          {assignments.map((linha) => {
            const aberta = estaAberta(linha);
            const detalhe = comoChegouAoAlvo(linha);

            return (
              <li
                key={linha.id}
                className={`border p-3 space-y-1 ${aberta ? 'border-status-info/40 bg-status-info/5' : 'border-border-sutil'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-text-primary">{rotuloDoAlvo(linha)}</span>
                  <span className={`text-[10px] uppercase tracking-widest ${aberta ? 'text-status-info' : 'text-text-tertiary'}`}>
                    {aberta ? 'aberta' : 'devolvida'}
                  </span>
                </div>

                {detalhe && <div className="text-text-tertiary text-[10px]">{detalhe}</div>}

                <div className="text-text-tertiary text-[10px] tabular-nums">
                  Entrega {formatarData(linha.checkoutAt)}
                  {linha.expectedCheckinAt && ` · prevista para ${formatarData(linha.expectedCheckinAt)}`}
                  {linha.checkinAt && ` · devolução ${formatarData(linha.checkinAt)}`}
                </div>

                {linha.checkoutNotes && (
                  <div className="text-text-secondary text-[10px]">Entrega: {linha.checkoutNotes}</div>
                )}
                {linha.checkinNotes && (
                  <div className="text-text-secondary text-[10px]">Devolução: {linha.checkinNotes}</div>
                )}
              </li>
            );
          })}
        </ul>

        {fechadas.length > 0 && (
          <p className="text-text-tertiary text-[10px] leading-relaxed">
            Posse devolvida NÃO é apagada: a linha fica com a data de devolução. É o que mantém
            respondível "quem estava com este equipamento em março?".
          </p>
        )}
      </section>
    </div>
  );
}

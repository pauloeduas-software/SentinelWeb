import { ExternalLink, MapPin, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import EstadoDaLista from '../../../../components/EstadoDaLista';
import { Avatar } from '../../../../components/ui/avatar';
import { Aviso } from '../../../../components/ui/aviso';
import { Badge, PontoDeStatus } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import type {
  Assignment, PosseResolvida, Responsavel,
} from '../../../../types/posse.types';
import { formatarData, formatarDiaDoInstante } from '../../../../helpers/format.helper';
import {
  comoChegouAoAlvo, estaAberta, postoDaPosseAberta, postoExcluido, rotuloDoAlvo, rotuloDoOcupanteDoPeriodo,
  sabeOsOcupantes, tipoDoAlvo,
} from '../helpers/rotulo-do-alvo.helper';

// A ABA POSSE — as três camadas do docs/referencia/modelo-de-posse.md numa tela só:
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
    explicacao: 'Responde porque ocupa o posto que detém o ativo. Sai da escala, sai a responsabilidade.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
interface PosseTabProps {
  posse: PosseResolvida | null;
  assignments: Assignment[];
  carregando: boolean;
  erro: string | null;
}

export default function PosseTab({
  posse, assignments, carregando, erro,
}: PosseTabProps) {
  // Cálculo fora do JSX: as perguntas da tela, respondidas uma vez.
  const entregue = posse?.assignmentId != null;
  const responsaveis = posse?.responsaveis ?? [];
  // O posto vem da POSSE ABERTA, e não do `posse.targetLabel`: o `PosseResolvida`
  // carrega o rótulo do alvo e não o id dele, e sem id não há link.
  const posto = postoDaPosseAberta(assignments);

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-6">
        <h3 className="text-sm font-medium text-text-primary">Quem responde hoje</h3>

        {responsaveis.length === 0 ? (
          <p className="text-sm text-text-tertiary">
            {entregue
              ? 'Ninguém responde por ele: a posse aponta para um posto sem ocupante.'
              : 'Sem posse aberta: o ativo não está entregue a ninguém.'}
          </p>
        ) : (
          <ul className="divide-y divide-border-sutil rounded-lg border border-border-sutil text-sm">
            {responsaveis.map((responsavel) => (
              <li key={`${responsavel.id}-${responsavel.via}-${responsavel.shift ?? ''}`} className="flex items-center gap-3 px-4 py-3">
                <Avatar nome={responsavel.name} />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text-primary">{responsavel.name}</span>
                    {responsavel.shift && <Badge>{responsavel.shift}</Badge>}
                    <Badge title={VIA[responsavel.via].explicacao}>{VIA[responsavel.via].rotulo}</Badge>
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {responsavel.email}
                    {responsavel.workstationName && ` · Posto: ${responsavel.workstationName}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {entregue && (
          <div className="space-y-2 rounded-lg border border-border-sutil p-4">
            <div className="text-xs font-medium text-text-tertiary">Entregue para</div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
              <MapPin className="size-4 text-text-tertiary" />
              {/* O NOME DO POSTO LEVA ATÉ ELE. A ficha dizia "Mesa 1" e parava
                  aí; quem precisava ver o resto da mesa — os outros ativos, quem a
                  ocupa, em que turno, e agora a telemetria do computador — tinha de
                  ir a /postos e procurar pelo nome. Só POSTO vira link: pessoa não
                  tem ficha de posto para onde ir. */}
              {posto ? (
                <Link to={`/postos/${posto.id}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                  {posto.name} <ExternalLink className="size-3" />
                </Link>
              ) : (
                posse?.targetLabel ?? '—'
              )}
              <span className="text-xs text-text-tertiary">{tipoDoAlvo(posse?.targetType)}</span>
            </div>

            {posse?.postoVago && (
              <Aviso tom="aviso" className="flex items-start gap-2 text-xs leading-relaxed">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  Posto vago: o ativo está entregue a um posto sem nenhum ocupante aberto. Devolva o
                  computador, ou coloque alguém no posto pela ficha dele, no nome logo acima.
                </span>
              </Aviso>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <h3 className="text-sm font-medium text-text-primary">Histórico de posse</h3>

        {assignments.length === 0 && (
          <EstadoDaLista carregando={carregando} erro={erro}>
            <p className="text-sm text-text-tertiary">Este ativo nunca foi entregue.</p>
          </EstadoDaLista>
        )}

        {assignments.length > 0 && (
          <ul className="divide-y divide-border-sutil rounded-lg border border-border-sutil text-sm">
            {assignments.map((linha) => {
              const aberta = estaAberta(linha);
              const detalhe = comoChegouAoAlvo(linha);

              return (
                <li key={linha.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-text-primary">
                      {rotuloDoAlvo(linha)}
                      {postoExcluido(linha) && <span className="text-xs font-normal text-text-tertiary"> · posto excluído</span>}
                    </span>
                    <PontoDeStatus tom={aberta ? 'info' : 'neutro'}>{aberta ? 'Aberta' : 'Devolvida'}</PontoDeStatus>
                  </div>

                  {detalhe && <div className="text-xs text-text-tertiary">{detalhe}</div>}

                  <div className="text-xs tabular-nums text-text-tertiary">
                    Entrega {formatarDiaDoInstante(linha.checkoutAt)}
                    {linha.expectedCheckinAt && ` · prevista para ${formatarData(linha.expectedCheckinAt)}`}
                    {linha.checkinAt && ` · devolução ${formatarDiaDoInstante(linha.checkinAt)}`}
                  </div>

                  {/* QUEM OCUPOU O POSTO NESTE PERÍODO (AW): é o que responde
                      "quem estava com este equipamento em março?" quando ele
                      foi entregue a uma mesa, e não a uma pessoa. */}
                  {sabeOsOcupantes(linha) && linha.ocupantesDoPeriodo && (
                    <div className="text-xs tabular-nums text-text-secondary">
                      {linha.ocupantesDoPeriodo.length > 0
                        ? <>{linha.ocupantesDoPeriodo.length === 1 ? 'Ocupante' : 'Ocupantes'}: {linha.ocupantesDoPeriodo.map(rotuloDoOcupanteDoPeriodo).join(' · ')}</>
                        : <span className="text-text-tertiary">Ninguém ocupou o posto neste período.</span>}
                    </div>
                  )}

                  {linha.checkoutNotes && (
                    <div className="text-xs text-text-secondary">Entrega: {linha.checkoutNotes}</div>
                  )}
                  {linha.checkinNotes && (
                    <div className="text-xs text-text-secondary">Devolução: {linha.checkinNotes}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

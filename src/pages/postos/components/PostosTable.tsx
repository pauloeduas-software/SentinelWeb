import { Armchair, TriangleAlert } from 'lucide-react';
import {
  TRACO, caminhoDoPosto, explicacaoDoVago, resumoDeAtivos, turnosDoPosto,
} from '../helpers/postos.helper';
import type { Posto } from '../../../domain/shared/workstation.types';

// A lista de postos. Apresentacional: recebe as linhas prontas e devolve o
// clique — não conhece query nem HTTP (docs/ARQUITETURA.md).
//
// O que cada linha responde, e que nenhuma tela de ITAM de prateleira responde:
// QUEM está na mesa, EM QUE TURNO, QUANTO equipamento ela segura, e se está
// VAGA — equipamento parado sem ninguém respondendo (docs/MODELO-POSSE.md).

interface PostosTableProps {
  postos: readonly Posto[];
  vazio: React.ReactNode;
  onAbrir: (posto: Posto) => void;
}

export default function PostosTable({ postos, vazio, onAbrir }: PostosTableProps) {
  return (
    <div className="bg-surface-card border border-border-sutil flex-1 overflow-auto">
      <table className="w-full text-left font-mono text-xs whitespace-nowrap">
        <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest sticky top-0 z-10">
          <tr>
            <th className="px-6 py-4 font-normal">Posto</th>
            <th className="px-6 py-4 font-normal">Quem está</th>
            <th className="px-6 py-4 font-normal">Ativos</th>
            <th className="px-6 py-4 font-normal">Situação</th>
          </tr>
        </thead>

        <tbody className="text-text-primary divide-y divide-border-sutil/50">
          {postos.map((posto) => {
            // O agrupamento por turno sai do JSX para o helper: aqui só se
            // escolhe o que mostrar (docs/ARQUITETURA.md).
            const turnos = turnosDoPosto(posto.ocupantes);

            return (
              <tr
                key={posto.id}
                onClick={() => onAbrir(posto)}
                className={`cursor-pointer transition-colors ${
                  // O posto vago fica marcado na LINHA inteira, não num ícone
                  // no canto: é o sinal que a tela existe para dar, e ele
                  // precisa ser visível de relance numa lista de vinte mesas.
                  posto.vago ? 'bg-status-warning/5 hover:bg-status-warning/10' : 'hover:bg-bg-base'
                }`}
              >
                <td className="px-6 py-4">
                  <div className="font-medium">{posto.name}</div>
                  <div className="text-[10px] text-text-tertiary mt-1">{caminhoDoPosto(posto.caminho)}</div>
                </td>

                <td className="px-6 py-4">
                  {turnos.length > 0 ? (
                    <div className="space-y-1 whitespace-normal max-w-[22rem]">
                      {turnos.map((faixa) => (
                        <div key={faixa.turno} className="flex flex-wrap items-baseline gap-2">
                          <span className="text-text-tertiary uppercase tracking-widest text-[10px] shrink-0">
                            {faixa.turno}
                          </span>
                          <span className="text-text-secondary">{faixa.pessoas.join(', ')}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-text-tertiary">ninguém</span>
                  )}
                </td>

                <td className="px-6 py-4 text-text-secondary tabular-nums">
                  {posto.totalAtivos > 0 ? resumoDeAtivos(posto.totalAtivos) : TRACO}
                </td>

                <td className="px-6 py-4">
                  {posto.vago ? (
                    <div className="max-w-[18rem] whitespace-normal">
                      <span className="flex items-center gap-1.5 text-status-warning uppercase tracking-widest text-[10px]">
                        <TriangleAlert size={11} className="shrink-0" /> Posto vago
                      </span>
                      <span className="block text-[10px] text-text-tertiary mt-1 leading-relaxed">
                        {explicacaoDoVago(posto)}
                      </span>
                    </div>
                  ) : posto.totalOcupantes > 0 ? (
                    <span className="text-text-tertiary uppercase tracking-widest text-[10px]">Ocupado</span>
                  ) : (
                    // Sem gente E sem equipamento: não é sinal de nada, é uma
                    // mesa que acabou de ser criada. Marcá-la de amarelo junto
                    // com as vagas apagaria a diferença que importa.
                    <span className="text-text-tertiary uppercase tracking-widest text-[10px]">Sem uso</span>
                  )}
                </td>
              </tr>
            );
          })}

          {postos.length === 0 && (
            <tr>
              <td colSpan={4} className="px-6 py-16 text-center text-text-tertiary">
                <div className="flex flex-col items-center justify-center">
                  <Armchair size={24} className="mb-4 opacity-50" />
                  {vazio}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

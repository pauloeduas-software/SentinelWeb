import { MapPin, Pencil, Trash2 } from 'lucide-react';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import {
  TRACO, explicacaoDoVago, resumoDeAtivos, turnosDoPosto,
} from '../helpers/postos.helper';
import type { Posto } from '../../../types/workstation.types';

// A lista de postos. Apresentacional: recebe as linhas prontas e devolve o
// clique — não conhece query nem HTTP (docs/referencia/arquitetura.md).
//
// O que cada linha responde, e que nenhuma tela de ITAM de prateleira responde:
// QUEM está na mesa, EM QUE TURNO, QUANTO equipamento ela segura, e se está
// VAGA — equipamento parado sem ninguém respondendo (docs/referencia/modelo-de-posse.md).
//
// A LINHA INTEIRA ABRE A FICHA, e, para o SUPERVISOR, o CADASTRO fica no `⋯` —
// Editar e Excluir, na ordem de Configurações: o destrutivo fica na ponta. Sem
// Desativar (AN): o posto vazio se exclui.

interface PostosTableProps {
  postos: readonly Posto[];
  vazio: React.ReactNode;
  onAbrir: (posto: Posto) => void;
  /** Mexer no cadastro é `SUPERVISOR`. */
  podeEditar: boolean;
  onEditar: (posto: Posto) => void;
  onExcluir: (posto: Posto) => void;
}

export default function PostosTable({
  postos, vazio, onAbrir, podeEditar, onEditar, onExcluir,
}: PostosTableProps) {
  if (postos.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center text-sm text-text-tertiary">
        <MapPin className="size-6 opacity-50" />
        {vazio}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Posto</TableHead>
            <TableHead className="hidden md:table-cell">Localização</TableHead>
            <TableHead>Quem está</TableHead>
            <TableHead className="hidden md:table-cell">Ativos</TableHead>
            <TableHead>Situação</TableHead>
            {podeEditar && <TableHead className="w-12 text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>

        <TableBody>
          {postos.map((posto) => {
            // O agrupamento por turno sai do JSX para o helper: aqui só se
            // escolhe o que mostrar (docs/referencia/arquitetura.md).
            const turnos = turnosDoPosto(posto.ocupantes);

            return (
              <TableRow key={posto.id} onClick={() => onAbrir(posto)} className="cursor-pointer">
                <TableCell>
                  {/* O botão é o caminho do teclado: o clique sobe para a linha. */}
                  <button type="button" className="text-left font-medium text-text-primary focus-visible:underline focus-visible:outline-none">
                    {posto.name}
                  </button>
                </TableCell>

                <TableCell className="hidden md:table-cell">{posto.location.name}</TableCell>

                <TableCell>
                  {turnos.length > 0 ? (
                    <div className="max-w-[22rem] space-y-1">
                      {turnos.map((faixa) => (
                        <div key={faixa.turno} className="flex flex-wrap items-baseline gap-2">
                          <span className="shrink-0 text-xs text-text-tertiary">{faixa.turno}</span>
                          <span>{faixa.pessoas.join(', ')}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-text-tertiary">ninguém</span>
                  )}
                </TableCell>

                <TableCell className="hidden tabular-nums md:table-cell">
                  {posto.totalAtivos > 0 ? resumoDeAtivos(posto.totalAtivos) : TRACO}
                </TableCell>

                <TableCell>
                  {/* O posto vago leva a marca de aviso, com a explicação embaixo:
                      é o sinal que a tela existe para dar, e ele precisa ser
                      visível de relance numa lista de vinte mesas. */}
                  {posto.vago ? (
                    <div className="max-w-[18rem] space-y-1">
                      <Badge tom="aviso">Posto vago</Badge>
                      <p className="text-xs leading-relaxed text-text-tertiary">{explicacaoDoVago(posto)}</p>
                    </div>
                  ) : posto.totalOcupantes > 0 ? (
                    <Badge>Ocupado</Badge>
                  ) : (
                    // Sem gente E sem equipamento: não é sinal de nada, é uma
                    // mesa que acabou de ser criada. Marcá-la de amarelo junto
                    // com as vagas apagaria a diferença que importa.
                    <Badge>Sem uso</Badge>
                  )}
                </TableCell>

                {podeEditar && (
                  <TableCell>
                    <AcoesDaLinha
                      nome={posto.name}
                      acoes={[
                        { rotulo: 'Editar', icone: Pencil, onClick: () => onEditar(posto) },
                        { rotulo: 'Excluir', icone: Trash2, onClick: () => onExcluir(posto), perigo: true },
                      ]}
                    />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

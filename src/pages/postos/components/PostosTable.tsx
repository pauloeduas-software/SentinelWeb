import { Pencil, Trash2, UserPlus } from 'lucide-react';
import SeloDoPosto from './SeloDoPosto';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeadAcoes, TableHeader, TableNome, TableRow } from '../../../components/ui/table';
import { TRACO, nomesDoPosto, quemEstaNoPosto } from '../helpers/postos.helper';
import type { Posto } from '../../../types/workstation.types';

// A lista de postos. Apresentacional: recebe as linhas prontas e devolve o
// clique — não conhece query nem HTTP (docs/referencia/arquitetura.md).
//
// O que cada linha responde, e que nenhuma tela de ITAM de prateleira responde:
// QUEM está na mesa, QUAL computador está nela, pela etiqueta, como no card da
// ficha, e se está VAGA — equipamento parado sem ninguém respondendo
// (docs/referencia/modelo-de-posse.md).
//
// A LINHA INTEIRA ABRE A FICHA, e o `⋯` começa pela operação, como o Entregar de
// Computadores, Estoque e Licenças: Adicionar ao posto, que o Técnico também faz.
// Para o SUPERVISOR, vem depois o CADASTRO — Editar e Excluir, na ordem de
// Configurações: o destrutivo fica na ponta. Sem Desativar (AN): o posto vazio se
// exclui.

interface PostosTableProps {
  postos: readonly Posto[];
  vazio: React.ReactNode;
  onAbrir: (posto: Posto) => void;
  onAdicionar: (posto: Posto) => void;
  /** Mexer no cadastro é `SUPERVISOR`. */
  podeEditar: boolean;
  onEditar: (posto: Posto) => void;
  onExcluir: (posto: Posto) => void;
}

export default function PostosTable({
  postos, vazio, onAbrir, onAdicionar, podeEditar, onEditar, onExcluir,
}: PostosTableProps) {
  return (
    <Card className="overflow-hidden">
      <Table className="min-w-[29rem] md:min-w-[50rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Posto</TableHead>
            <TableHead className="hidden w-[16%] md:table-cell">Localização</TableHead>
            <TableHead>Responsáveis</TableHead>
            <TableHead className="hidden w-32 md:table-cell">Etiqueta</TableHead>
            <TableHead className="w-36">Status</TableHead>
            <TableHeadAcoes />
          </TableRow>
        </TableHeader>

        <TableBody>
          {postos.map((posto) => (
              <TableRow key={posto.id} onClick={() => onAbrir(posto)}>
                <TableCell><TableNome>{posto.name}</TableNome></TableCell>
                <TableCell className="hidden md:table-cell">{posto.location.name}</TableCell>
                <TableCell title={nomesDoPosto(posto).join(', ')}>{quemEstaNoPosto(posto)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {/* Em mono e na cor do texto, como a etiqueta em Descobertas. */}
                  {posto.computadores.length > 0
                    ? <span className="font-mono text-text-primary">{posto.computadores.join(', ')}</span>
                    : TRACO}
                </TableCell>
                <TableCell><SeloDoPosto posto={posto} /></TableCell>

                <TableCell>
                  <AcoesDaLinha
                    nome={posto.name}
                    acoes={[
                      { rotulo: 'Adicionar ao posto', icone: UserPlus, onClick: () => onAdicionar(posto) },
                      podeEditar && { rotulo: 'Editar', icone: Pencil, onClick: () => onEditar(posto) },
                      podeEditar && { rotulo: 'Excluir', icone: Trash2, onClick: () => onExcluir(posto), perigo: true },
                    ]}
                  />
                </TableCell>
              </TableRow>
          ))}
        </TableBody>
      </Table>
      {postos.length === 0 && vazio}
    </Card>
  );
}

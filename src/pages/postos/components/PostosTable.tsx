import { Pencil, Trash2 } from 'lucide-react';
import SeloDoPosto from './SeloDoPosto';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeadAcoes, TableHeader, TableNome, TableRow } from '../../../components/ui/table';
import { TRACO, nomesDoPosto, quemEstaNoPosto, resumoDeAtivos } from '../helpers/postos.helper';
import type { Posto } from '../../../types/workstation.types';

// A lista de postos. Apresentacional: recebe as linhas prontas e devolve o
// clique — não conhece query nem HTTP (docs/referencia/arquitetura.md).
//
// O que cada linha responde, e que nenhuma tela de ITAM de prateleira responde:
// QUEM está na mesa, QUANTO equipamento ela segura, e se está VAGA — equipamento
// parado sem ninguém respondendo (docs/referencia/modelo-de-posse.md).
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
  return (
    <Card className="overflow-hidden">
      <Table className="min-w-[29rem] md:min-w-[50rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Posto</TableHead>
            <TableHead className="hidden w-[16%] md:table-cell">Localização</TableHead>
            <TableHead>Responsáveis</TableHead>
            <TableHead className="hidden w-28 md:table-cell">Ativos</TableHead>
            <TableHead className="w-36">Situação</TableHead>
            {podeEditar && <TableHeadAcoes />}
          </TableRow>
        </TableHeader>

        <TableBody>
          {postos.map((posto) => (
              <TableRow key={posto.id} onClick={() => onAbrir(posto)}>
                <TableCell><TableNome>{posto.name}</TableNome></TableCell>
                <TableCell className="hidden md:table-cell">{posto.location.name}</TableCell>
                <TableCell title={nomesDoPosto(posto).join(', ')}>{quemEstaNoPosto(posto)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {posto.totalAtivos > 0 ? resumoDeAtivos(posto.totalAtivos) : TRACO}
                </TableCell>
                <TableCell><SeloDoPosto posto={posto} /></TableCell>

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
          ))}
        </TableBody>
      </Table>
      {postos.length === 0 && vazio}
    </Card>
  );
}

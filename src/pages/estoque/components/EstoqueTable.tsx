import { Package, Pencil, Power, PowerOff, Trash2, UserPlus } from 'lucide-react';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import type { ItemDeEstoque } from '../../../types/stock.types';
import { classeDaConta, motivoParaNaoEntregar, resumoDaContagem } from '../helpers/estoque.helper';

// A tabela de estoque. Apresentacional puro: recebe valor e callback, não
// conhece query nem HTTP.
//
// A COLUNA PRINCIPAL É A CONTA — total, em uso, disponíveis —, e os números
// aparecem todos, como na `LicencaTable`: "3 disponíveis" sozinho não diz se
// sobrou muito ou pouco.
//
// A LINHA INTEIRA ABRE O DETALHE, e o `⋯` guarda as ações (AY). O CADASTRO É O DAS
// CONFIGURAÇÕES (`CatalogTable`): Editar, Desativar/Ativar e Excluir, nessa ordem;
// o desativado fica na lista, esmaecido e marcado; e Excluir sempre clica — o item
// em uso recebe o 409 do servidor, que diz com quem está e manda devolver (AG).

interface EstoqueTableProps {
  itens: ItemDeEstoque[];
  /** Uma ação está correndo: os botões esperam, para o duplo clique não virar erro. */
  ocupado: boolean;
  onAbrir: (item: ItemDeEstoque) => void;
  onEntregar: (item: ItemDeEstoque) => void;
  onEditar: (item: ItemDeEstoque) => void;
  /** Desativar e ativar — o mesmo botão, pelo estado do item. `SUPERVISOR` no servidor (AV); ausente, o botão some. */
  onAlternarAtivo?: (item: ItemDeEstoque) => void;
  /** Excluir é `SUPERVISOR` no servidor. Ausente, o botão some — quem decide é a página. */
  onExcluir?: (item: ItemDeEstoque) => void;
  vazio: React.ReactNode;
}

export default function EstoqueTable({
  itens, ocupado, onAbrir, onEntregar, onEditar, onAlternarAtivo, onExcluir, vazio,
}: EstoqueTableProps) {
  if (itens.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-text-tertiary">
        <Package className="size-6 opacity-50" />
        {vazio}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="hidden md:table-cell">Localização</TableHead>
            <TableHead>Quantidade</TableHead>
            <TableHead className="w-12 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((item) => {
            const motivoSemEntrega = motivoParaNaoEntregar(item);

            return (
              <TableRow
                key={item.id}
                onClick={() => onAbrir(item)}
                className={item.isActive ? 'cursor-pointer' : 'cursor-pointer opacity-60'}
              >
                <TableCell>
                  {/* O botão é o caminho do teclado: o clique sobe para a linha. */}
                  <button type="button" className="text-left font-medium text-text-primary focus-visible:underline focus-visible:outline-none">
                    {item.name}
                  </button>
                  {!item.isActive && <Badge tom="aviso" className="ml-2">Desativado</Badge>}
                  {item.notes && <div className="mt-0.5 line-clamp-1 text-xs text-text-tertiary">{item.notes}</div>}
                </TableCell>

                <TableCell>{item.category.name}</TableCell>

                <TableCell className="hidden md:table-cell">{item.location?.name ?? '—'}</TableCell>

                <TableCell className={classeDaConta(item)}>{resumoDaContagem(item)}</TableCell>

                <TableCell>
                  <AcoesDaLinha
                    nome={item.name}
                    acoes={[
                      item.isActive && {
                        rotulo: 'Entregar',
                        icone: UserPlus,
                        onClick: () => onEntregar(item),
                        disabled: motivoSemEntrega !== null,
                        titulo: motivoSemEntrega ?? undefined,
                      },
                      { rotulo: 'Editar', icone: Pencil, onClick: () => onEditar(item) },
                      onAlternarAtivo && {
                        rotulo: item.isActive ? 'Desativar' : 'Ativar',
                        icone: item.isActive ? PowerOff : Power,
                        onClick: () => onAlternarAtivo(item),
                        disabled: ocupado,
                      },
                      onExcluir && {
                        rotulo: 'Excluir',
                        icone: Trash2,
                        onClick: () => onExcluir(item),
                        disabled: ocupado,
                        perigo: true,
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

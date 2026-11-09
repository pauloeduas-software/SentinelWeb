import { Pencil, Power, PowerOff, Trash2, UserPlus } from 'lucide-react';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import { PontoDeStatus } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeadAcoes, TableHeader, TableLinha, TableNome, TableRow, TableSublinha } from '../../../components/ui/table';
import type { ItemDeEstoque } from '../../../types/stock.types';
import { classeDaConta, ehConsumivel, motivoParaNaoEntregar } from '../helpers/estoque.helper';

// A tabela de estoque. Apresentacional puro: recebe valor e callback, não
// conhece query nem HTTP.
//
// A COLUNA PRINCIPAL É A CONTA: os disponíveis e, embaixo, o total e o que está em
// uso, como na `LicencaTable`: "3 disponíveis" sozinho não diz se sobrou muito ou pouco.
//
// A LINHA INTEIRA ABRE O DETALHE, e o `⋯` guarda as ações (AY). O CADASTRO É O DAS
// CONFIGURAÇÕES (`CatalogTable`): Editar, Desativar/Ativar e Excluir, nessa ordem;
// o desativado fica na lista, esmaecido, com o Status dizendo; e Excluir sempre clica — o item
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
  return (
    <Card className="overflow-hidden">
      <Table className="min-w-[44rem] md:min-w-[52rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="w-[16%]">Categoria</TableHead>
            <TableHead className="hidden w-[16%] md:table-cell">Localização</TableHead>
            <TableHead className="w-[18%]">Quantidade</TableHead>
            <TableHead className="w-36">Status</TableHead>
            <TableHeadAcoes />
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((item) => {
            const motivoSemEntrega = motivoParaNaoEntregar(item);

            return (
              <TableRow key={item.id} onClick={() => onAbrir(item)} apagada={!item.isActive}>
                <TableCell><TableNome>{item.name}</TableNome></TableCell>

                <TableCell>{item.category.name}</TableCell>

                <TableCell className="hidden md:table-cell">{item.location?.name ?? '—'}</TableCell>

                <TableCell>
                  <TableLinha className={classeDaConta(item)}>
                    {item.disponivel} {item.disponivel === 1 ? 'disponível' : 'disponíveis'}
                  </TableLinha>
                  {!ehConsumivel(item) && <TableSublinha>{item.qty} no total · {item.emUso} em uso</TableSublinha>}
                </TableCell>

                <TableCell>
                  <PontoDeStatus tom={item.isActive ? 'sucesso' : 'aviso'}>{item.isActive ? 'Ativo' : 'Desativado'}</PontoDeStatus>
                </TableCell>

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
      {itens.length === 0 && vazio}
    </Card>
  );
}

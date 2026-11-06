import { Pencil, Power, PowerOff, Trash2, UserPlus } from 'lucide-react';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import { PontoDeStatus } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeadAcoes, TableHeader, TableLinha, TableNome, TableRow, TableSublinha } from '../../../components/ui/table';
import type { Licenca } from '../../../types/license.types';
import { ROTULO_DO_STATUS, TOM_DO_STATUS, textoDoPrazo } from '../../../helpers/licenca.helper';
import { motivoParaNaoEntregar } from '../helpers/licenca.helper';
import { formatarData } from '../../../helpers/format.helper';

// A tabela de licenças. Apresentacional puro: recebe valor e callback, não
// conhece query nem HTTP.
//
// A COLUNA PRINCIPAL É A CONTA — compradas, em uso, livres —, e os
// números aparecem todos: "2 livres" sozinho não diz se sobrou muito ou pouco.
//
// A LINHA INTEIRA ABRE O DETALHE, e o `⋯` guarda as ações (AY). O CADASTRO É O DAS
// CONFIGURAÇÕES (`CatalogTable`, AF): Editar, Encerrar/Reabrir no lugar do
// Desativar/Ativar, e Excluir; a encerrada fica na lista, esmaecida e marcada na
// coluna Status; e Excluir sempre clica — a licença em uso recebe o 409 do
// servidor, que diz com quem está e manda devolver (AG). Encerrar grava a data do
// fim do contrato, que entra no status e no alerta.

interface LicencaTableProps {
  licencas: Licenca[];
  /** Uma ação está correndo: os botões esperam, para o duplo clique não virar erro. */
  ocupado: boolean;
  onAbrir: (licenca: Licenca) => void;
  /** Editar, encerrar e reabrir são `SUPERVISOR` no servidor (AV). Ausentes, os botões somem. */
  onEditar?: (licenca: Licenca) => void;
  onEntregar: (licenca: Licenca) => void;
  /** Encerrar e reabrir — o mesmo botão, pelo status da licença. */
  onAlternarEncerrada?: (licenca: Licenca) => void;
  /** Excluir é `SUPERVISOR` no servidor. Ausente, o botão some — quem decide é a página. */
  onExcluir?: (licenca: Licenca) => void;
  vazio: React.ReactNode;
}

export default function LicencaTable({
  licencas, ocupado, onAbrir, onEditar, onEntregar, onAlternarEncerrada, onExcluir, vazio,
}: LicencaTableProps) {
  return (
    <Card className="overflow-hidden">
      <Table className="min-w-[46rem] md:min-w-[56rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Licença</TableHead>
            <TableHead className="hidden w-[16%] md:table-cell">Categoria</TableHead>
            <TableHead className="w-[18%]">Quantidade</TableHead>
            <TableHead className="w-[20%]">Vencimento</TableHead>
            <TableHead className="w-36">Status</TableHead>
            <TableHeadAcoes />
          </TableRow>
        </TableHeader>
        <TableBody>
          {licencas.map((licenca) => {
            const motivoSemEntrega = motivoParaNaoEntregar(licenca);
            const encerrada = licenca.status === 'ENCERRADA';

            return (
              <TableRow key={licenca.id} onClick={() => onAbrir(licenca)} apagada={encerrada}>
                <TableCell><TableNome>{licenca.name}</TableNome></TableCell>

                <TableCell className="hidden md:table-cell">{licenca.category?.name ?? '—'}</TableCell>

                <TableCell>
                  <TableLinha>{licenca.livres} {licenca.livres === 1 ? 'livre' : 'livres'}</TableLinha>
                  <TableSublinha>{licenca.seatsTotal} {licenca.seatsTotal === 1 ? 'comprada' : 'compradas'} · {licenca.emUso} em uso</TableSublinha>
                </TableCell>

                <TableCell>
                  {encerrada ? `encerrada em ${formatarData(licenca.terminationDate)}` : textoDoPrazo(licenca.diasParaVencer)}
                </TableCell>

                <TableCell>
                  <PontoDeStatus tom={TOM_DO_STATUS[licenca.status]}>{ROTULO_DO_STATUS[licenca.status]}</PontoDeStatus>
                </TableCell>

                <TableCell>
                  <AcoesDaLinha
                    nome={licenca.name}
                    acoes={[
                      !encerrada && {
                        rotulo: 'Entregar',
                        icone: UserPlus,
                        onClick: () => onEntregar(licenca),
                        disabled: motivoSemEntrega !== null,
                        titulo: motivoSemEntrega ?? undefined,
                      },
                      onEditar && { rotulo: 'Editar', icone: Pencil, onClick: () => onEditar(licenca) },
                      onAlternarEncerrada && {
                        rotulo: encerrada ? 'Reabrir' : 'Encerrar',
                        icone: encerrada ? Power : PowerOff,
                        onClick: () => onAlternarEncerrada(licenca),
                        disabled: ocupado,
                      },
                      onExcluir && {
                        rotulo: 'Excluir',
                        icone: Trash2,
                        onClick: () => onExcluir(licenca),
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
      {licencas.length === 0 && vazio}
    </Card>
  );
}

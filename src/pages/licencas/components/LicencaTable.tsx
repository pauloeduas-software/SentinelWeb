import { KeyRound, Pencil, Power, PowerOff, Trash2, UserPlus } from 'lucide-react';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import { PontoDeStatus } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import type { Licenca } from '../../../types/license.types';
import { ROTULO_DO_STATUS, resumoDaContagem, textoDoPrazo } from '../../../helpers/licenca.helper';
import { TOM_DO_STATUS, motivoParaNaoEntregar } from '../helpers/licenca.helper';
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
  if (licencas.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-text-tertiary">
        <KeyRound className="size-6 opacity-50" />
        {vazio}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Licença</TableHead>
            <TableHead className="hidden md:table-cell">Categoria</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Quantidade</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead className="w-12 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {licencas.map((licenca) => {
            const motivoSemEntrega = motivoParaNaoEntregar(licenca);
            const encerrada = licenca.status === 'ENCERRADA';

            return (
              <TableRow
                key={licenca.id}
                onClick={() => onAbrir(licenca)}
                className={encerrada ? 'cursor-pointer opacity-60' : 'cursor-pointer'}
              >
                <TableCell>
                  {/* O botão é o caminho do teclado: o clique sobe para a linha. */}
                  <button type="button" className="text-left font-medium text-text-primary focus-visible:underline focus-visible:outline-none">
                    {licenca.name}
                  </button>
                </TableCell>

                <TableCell className="hidden md:table-cell">{licenca.category?.name ?? '—'}</TableCell>

                <TableCell>
                  <PontoDeStatus tom={TOM_DO_STATUS[licenca.status]}>{ROTULO_DO_STATUS[licenca.status]}</PontoDeStatus>
                </TableCell>

                <TableCell>{resumoDaContagem(licenca)}</TableCell>

                <TableCell>
                  {encerrada ? `encerrada em ${formatarData(licenca.terminationDate)}` : textoDoPrazo(licenca.diasParaVencer)}
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
    </Card>
  );
}

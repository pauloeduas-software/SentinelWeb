import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BatteryWarning } from 'lucide-react';
import ListaVazia from '../../../components/ListaVazia';
import ListToolbar from '../../../components/ListToolbar';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableNome, TableRow, TableSublinha } from '../../../components/ui/table';
import { formatarData } from '../../../helpers/format.helper';
import { nomeDoResponsavel } from '../../../helpers/responsavel.helper';
import { useListaLocalNaUrl } from '../../../hooks/usePaginaLocal';
import { comFiltros } from '../../../hooks/useVoltaComFiltros';
import type { AtivoOcioso } from '../../../types/reconciliation.types';

// OS COMPUTADORES SEM USO. Responsáveis diz para quem cada um foi entregue, e a
// conversa é com esse: "você ainda precisa disto?".
//
// A LINHA INTEIRA LEVA À FICHA DO COMPUTADOR.

interface Props {
  ociosos: AtivoOcioso[];
  carregando: boolean;
  erro: string | null;
  acao: ReactNode;
}

export default function OciososTable({ ociosos, carregando, erro, acao }: Props) {
  const navigate = useNavigate();
  const lista = useListaLocalNaUrl(ociosos, (ativo) => `${ativo.assetTag} ${ativo.serial ?? ''} ${ativo.name ?? ''} ${ativo.hostname ?? ''}`);

  return (
    <>
      <ListToolbar
        search={lista.search}
        onSearchChange={lista.changeSearch}
        placeholder="Buscar por etiqueta, série, nome ou máquina…"
        acao={acao}
        page={lista.page}
        perPage={lista.perPage}
        total={lista.total}
        onPageChange={lista.setPage}
      />

      <Card className="overflow-hidden">
        <Table className="min-w-[52rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Etiqueta</TableHead>
              <TableHead>Máquina</TableHead>
              <TableHead>Responsáveis</TableHead>
              <TableHead className="w-36">Último uso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.visiveis.map((ativo) => (
              <TableRow key={ativo.assetId} onClick={() => navigate(`/computadores/${ativo.assetId}`, comFiltros(lista.parametros, '/descobertas'))}>
                <TableCell>
                  <TableNome className="font-mono">{ativo.assetTag}</TableNome>
                  {ativo.serial && <TableSublinha className="font-mono">{ativo.serial}</TableSublinha>}
                </TableCell>
                <TableCell>{ativo.hostname ?? '—'}</TableCell>
                <TableCell>{nomeDoResponsavel(ativo) || '—'}</TableCell>
                <TableCell>
                  {ativo.ultimoUso ? (
                    <>
                      {formatarData(ativo.ultimoUso)}
                      <TableSublinha>{ativo.diasSemUso} dias sem uso</TableSublinha>
                    </>
                  ) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {lista.total === 0 && (
          <ListaVazia
            icone={BatteryWarning}
            carregando={carregando}
            erro={erro}
            nome="computador"
            busca={lista.search}
            frase="Nenhum computador ocioso nos últimos 30 dias."
          >
            <span className="text-xs">Só entram aqui computadores com agente.</span>
          </ListaVazia>
        )}
      </Card>
    </>
  );
}

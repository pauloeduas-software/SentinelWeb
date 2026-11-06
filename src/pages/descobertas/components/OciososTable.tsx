import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BatteryWarning } from 'lucide-react';
import ListaVazia from '../../../components/ListaVazia';
import ListToolbar from '../../../components/ListToolbar';
import { PontoDeStatus } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableNome, TableRow, TableSublinha } from '../../../components/ui/table';
import { formatarData } from '../../../helpers/format.helper';
import { useListaLocalNaUrl } from '../../../hooks/usePaginaLocal';
import { comFiltros } from '../../../hooks/useVoltaComFiltros';
import type { AtivoOcioso } from '../../../types/reconciliation.types';

// "NINGUÉM USA" × "NINGUÉM RESPONDE" — duas conversas diferentes, com duas
// pessoas diferentes.
//
// A coluna `postoVago` é a que nenhum ITAM de prateleira tem como preencher:
// ela só existe porque há uma camada entre o ativo e a pessoa
// (docs/referencia/modelo-de-posse.md). Um notebook ocioso COM responsável é uma conversa
// ("você ainda precisa disto?"); um desktop ocioso numa mesa VAZIA é outra
// ("isto volta para o estoque").
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
  const lista = useListaLocalNaUrl(ociosos, (ativo) => `${ativo.assetTag} ${ativo.name ?? ''} ${ativo.hostname ?? ''}`);

  return (
    <>
      <ListToolbar
        search={lista.search}
        onSearchChange={lista.changeSearch}
        placeholder="Buscar por ativo ou máquina…"
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
              <TableHead className="w-44">Ativo</TableHead>
              <TableHead>Máquina</TableHead>
              <TableHead>Quem responde</TableHead>
              <TableHead className="w-36">Último uso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.visiveis.map((ativo) => (
              <TableRow key={ativo.assetId} onClick={() => navigate(`/computadores/${ativo.assetId}`, comFiltros(lista.parametros, '/descobertas'))}>
                <TableCell>
                  <TableNome className="font-mono">{ativo.assetTag}</TableNome>
                  {ativo.name && <TableSublinha>{ativo.name}</TableSublinha>}
                </TableCell>
                <TableCell>{ativo.hostname ?? '—'}</TableCell>
                <TableCell>
                  {ativo.postoVago ? (
                    <PontoDeStatus tom="aviso">Posto vago</PontoDeStatus>
                  ) : ativo.responsaveis.length > 0 ? (
                    ativo.responsaveis.map((pessoa) => pessoa.name).join(', ')
                  ) : '—'}
                </TableCell>
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
            nome="ativo"
            busca={lista.search}
            frase="Nenhum ativo ocioso nos últimos 30 dias."
          >
            <span className="text-xs">Só entram aqui ativos com agente.</span>
          </ListaVazia>
        )}
      </Card>
    </>
  );
}

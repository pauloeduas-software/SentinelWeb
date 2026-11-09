import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { MonitorCheck, Unlink } from 'lucide-react';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import ListaVazia from '../../../components/ListaVazia';
import ListToolbar from '../../../components/ListToolbar';
import { PontoDeStatus } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeadAcoes, TableHeader, TableLinha, TableNome, TableRow, TableSublinha } from '../../../components/ui/table';
import { formatarDataHora } from '../../../helpers/format.helper';
import { useListaLocalNaUrl } from '../../../hooks/usePaginaLocal';
import { comFiltros } from '../../../hooks/useVoltaComFiltros';
import type { Endpoint } from '../../../types/endpoint.types';

// AS MÁQUINAS QUE JÁ SÃO PATRIMÔNIO — o outro lado da lista "Sem vínculo".
//
// Existe para a pergunta "esta máquina é qual ativo?" ter resposta sem abrir
// ativo por ativo: a etiqueta está na linha, e a linha leva à ficha, onde moram a
// telemetria e o comando. O vínculo mora nesta tela (BZ): vincular é em Sem vínculo
// e em Sugestões, e desvincular é o `⋯` desta lista.

interface Props {
  maquinas: Endpoint[];
  carregando: boolean;
  erro: string | null;
  acao: ReactNode;
  ocupado: boolean;
  onDesvincular: (maquina: Endpoint) => void;
}

export default function VinculadasTable({ maquinas, carregando, erro, acao, ocupado, onDesvincular }: Props) {
  const navigate = useNavigate();
  const lista = useListaLocalNaUrl(
    maquinas,
    (maquina) => `${maquina.hostname} ${maquina.osVersion} ${maquina.asset?.assetTag ?? ''} ${maquina.asset?.name ?? ''}`,
  );

  return (
    <>
      <ListToolbar
        search={lista.search}
        onSearchChange={lista.changeSearch}
        placeholder="Buscar por máquina, etiqueta ou sistema…"
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
              <TableHead>Máquina</TableHead>
              <TableHead className="w-44">Etiqueta</TableHead>
              <TableHead>Sistema operacional</TableHead>
              <TableHead className="w-48">Último contato</TableHead>
              <TableHead className="w-36">Status</TableHead>
              <TableHeadAcoes />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.visiveis.map((maquina) => {
              // `asset` pode faltar só na linha que o `SetNull` desfez entre duas
              // revalidações: sem ficha para abrir, a linha não clica.
              const { asset } = maquina;
              const online = maquina.status === 'ONLINE';

              return (
                <TableRow key={maquina.id} onClick={asset ? () => navigate(`/computadores/${asset.id}`, comFiltros(lista.parametros, '/descobertas')) : undefined}>
                  <TableCell><TableNome>{maquina.hostname}</TableNome></TableCell>
                  <TableCell>
                    {asset ? (
                      <>
                        <TableLinha className="font-mono text-text-primary">{asset.assetTag}</TableLinha>
                        {asset.name && <TableSublinha>{asset.name}</TableSublinha>}
                      </>
                    ) : '—'}
                  </TableCell>
                  <TableCell>{maquina.osVersion}</TableCell>
                  <TableCell>{formatarDataHora(maquina.lastSeen)}</TableCell>
                  <TableCell>
                    <PontoDeStatus tom={online ? 'sucesso' : 'neutro'}>{online ? 'Online' : 'Offline'}</PontoDeStatus>
                  </TableCell>
                  <TableCell>
                    <AcoesDaLinha
                      nome={maquina.hostname}
                      acoes={[asset && { rotulo: 'Desvincular', icone: Unlink, onClick: () => onDesvincular(maquina), disabled: ocupado }]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {lista.total === 0 && (
          <ListaVazia
            icone={MonitorCheck}
            carregando={carregando}
            erro={erro}
            nome="máquina"
            genero="f"
            busca={lista.search}
            frase="Nenhuma máquina vinculada a um computador ainda."
          />
        )}
      </Card>
    </>
  );
}

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { MonitorCheck } from 'lucide-react';
import ListaVazia from '../../../components/ListaVazia';
import ListToolbar from '../../../components/ListToolbar';
import { PontoDeStatus } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableNome, TableRow, TableSublinha } from '../../../components/ui/table';
import { formatarDataHora } from '../../../helpers/format.helper';
import { useListaLocalNaUrl } from '../../../hooks/usePaginaLocal';
import { comFiltros } from '../../../hooks/useVoltaComFiltros';
import type { Endpoint } from '../../../types/endpoint.types';

// AS MÁQUINAS QUE JÁ SÃO PATRIMÔNIO — o outro lado da lista "Sem vínculo".
//
// Existe para a pergunta "esta máquina é qual ativo?" ter resposta sem abrir
// ativo por ativo: a etiqueta está na linha, e a linha leva à ficha, onde moram a
// telemetria, o comando e o Desvincular. Só leitura — mexer no vínculo é na
// aba Máquina do ativo, que tem o contexto para isso.

interface Props {
  maquinas: Endpoint[];
  carregando: boolean;
  erro: string | null;
  acao: ReactNode;
}

export default function VinculadasTable({ maquinas, carregando, erro, acao }: Props) {
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
        placeholder="Buscar por máquina, ativo ou sistema…"
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
            <TableHead className="w-44">Ativo</TableHead>
            <TableHead>Sistema operacional</TableHead>
            <TableHead className="w-48">Último contato</TableHead>
            <TableHead className="w-36">Status</TableHead>
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
                      <span className="font-mono text-text-primary">{asset.assetTag}</span>
                      {asset.name && <TableSublinha>{asset.name}</TableSublinha>}
                    </>
                  ) : '—'}
                </TableCell>
                <TableCell>{maquina.osVersion}</TableCell>
                <TableCell>{formatarDataHora(maquina.lastSeen)}</TableCell>
                <TableCell>
                  <PontoDeStatus tom={online ? 'sucesso' : 'neutro'}>{online ? 'Online' : 'Offline'}</PontoDeStatus>
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
          frase="Nenhuma máquina vinculada a um ativo ainda."
        />
      )}
    </Card>
    </>
  );
}

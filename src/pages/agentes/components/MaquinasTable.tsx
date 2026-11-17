import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, MonitorCheck, RefreshCw, Trash2, Unlink } from 'lucide-react';
import VincularMaquinaForm from './VincularMaquinaForm';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import ListaVazia from '../../../components/ListaVazia';
import ListToolbar from '../../../components/ListToolbar';
import { PontoDeStatus } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableCellAcoes, TableHeadAcoes, TableHeader, TableLinha, TableNome, TableRow, TableSublinha } from '../../../components/ui/table';
import { formatarDataHora } from '../../../helpers/format.helper';
import { caminhoDaMaquina } from '../../../helpers/maquina.helper';
import { comFiltros } from '../../../hooks/useVoltaComFiltros';
import type { useListaLocalNaUrl } from '../../../hooks/usePaginaLocal';
import type { Endpoint } from '../../../types/endpoint.types';
import type { VistaDosAgentes } from '../hooks/useAgentes';

// AS MÁQUINAS COM AGENTE, numa lista só (DC). É a lista de Agentes do GLPI: a
// coluna Computador vazia é a máquina que ainda não é patrimônio, e a vista a
// separa.
//
// A LINHA ABRE A FICHA DA MÁQUINA (DF), nas três vistas: o card com o que ela diz de
// si, o computador que ela é e como ela está agora. O `⋯` faz o mesmo que a ficha,
// sem abrir — o vínculo mora nesta tela (BZ).
//
// COM COMPUTADOR: o `⋯` desvincula. Nas três vistas, ele também atualiza a
// máquina agora (DK).
//
// SEM COMPUTADOR: a série não a ligou sozinha, e a coluna Computador fica com o
// traço. Qual computador ela parece ser, ou por que não ligou, está na ficha (DI),
// e o Vincular abre com a dica escolhida.
//
// SUMIDOS: sem sinal há 30 dias, com computador ou sem, e cada linha com o `⋯`
// da vista de onde veio. Na sem computador, o Excluir (DD), que também está em
// Sem computador para a máquina roubada; a com computador desvincula antes.

type Lista = ReturnType<typeof useListaLocalNaUrl<Endpoint>>;

interface Props {
  vista: VistaDosAgentes;
  lista: Lista;
  carregando: boolean;
  erro: string | null;
  ocupado: boolean;
  onVincular: (endpointId: string, assetId: string, targetWorkstationId: string | null) => Promise<void>;
  onDesvincular: (maquina: Endpoint) => void;
  onAtualizar: (maquina: Endpoint) => void;
  /** Só para o Supervisor: sem ele, o item não aparece. */
  onExcluir?: (maquina: Endpoint) => void;
}

const FRASE_DA_LISTA_VAZIA: Record<VistaDosAgentes, string> = {
  com: 'Nenhuma máquina vinculada a um computador ainda.',
  sem: 'Nenhuma máquina sem computador.',
  sumidos: 'Nenhuma máquina sem contato há mais de 30 dias.',
};


export default function MaquinasTable({
  vista, lista, carregando, erro, ocupado, onVincular, onDesvincular, onAtualizar, onExcluir,
}: Props) {
  const navigate = useNavigate();
  // A MÁQUINA NO PAINEL DE VÍNCULO: a linha, e não o id. Quando a entrega é recusada
  // o vínculo fica, e a máquina sai desta lista na revalidação; o painel precisa
  // sobreviver a isso para dizer que só metade aconteceu.
  const [vinculando, setVinculando] = useState<Endpoint | null>(null);

  return (
    <>
      <ListToolbar
        search={lista.search}
        onSearchChange={lista.changeSearch}
        placeholder="Buscar por máquina, computador, série ou IP…"
        page={lista.page}
        perPage={lista.perPage}
        total={lista.total}
        onPageChange={lista.setPage}
      />

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Máquina</TableHead>
              <TableHead coluna="etiqueta" aparece="lg">Computador</TableHead>
              <TableHead coluna="ip" aparece="5xl">Endereço IP</TableHead>
              <TableHead aparece="4xl">Sistema operacional</TableHead>
              <TableHead coluna="curta" aparece="6xl">Versão</TableHead>
              <TableHead coluna="dataHora" aparece="2xl">Último contato</TableHead>
              <TableHead coluna="status">Status</TableHead>
              <TableHeadAcoes />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.visiveis.map((maquina) => {
              // `asset` pode faltar na vista Com computador só na linha que o
              // `SetNull` desfez entre duas revalidações: ela mostra o traço, como a sem computador.
              const { asset } = maquina;
              const online = maquina.status === 'ONLINE';

              return (
                <TableRow
                  key={maquina.id}
                  onClick={() => navigate(caminhoDaMaquina(maquina.id), comFiltros(lista.parametros))}
                >
                  <TableCell>
                    <TableNome>{maquina.hostname}</TableNome>
                    {maquina.biosSerial && <TableSublinha className="font-mono">{maquina.biosSerial}</TableSublinha>}
                  </TableCell>
                  <TableCell aparece="lg">
                    {asset ? (
                      <>
                        <TableLinha className="font-mono text-text-primary">{asset.assetTag}</TableLinha>
                        {asset.serial && <TableSublinha className="font-mono">{asset.serial}</TableSublinha>}
                      </>
                    ) : (
                      <TableLinha>—</TableLinha>
                    )}
                  </TableCell>
                  <TableCell aparece="5xl" className="font-mono">{maquina.localIp ?? '—'}</TableCell>
                  <TableCell aparece="4xl">{maquina.osVersion}</TableCell>
                  <TableCell aparece="6xl" className="font-mono">{maquina.agentVersion ?? '—'}</TableCell>
                  <TableCell aparece="2xl">{formatarDataHora(maquina.lastSeen)}</TableCell>
                  <TableCell>
                    <PontoDeStatus tom={online ? 'sucesso' : 'neutro'}>{online ? 'Conectado' : 'Desconectado'}</PontoDeStatus>
                  </TableCell>
                  <TableCellAcoes>
                    <AcoesDaLinha
                      nome={maquina.hostname}
                      acoes={[
                        asset
                          ? { rotulo: 'Desvincular', icone: Unlink, onClick: () => onDesvincular(maquina), disabled: ocupado }
                          : { rotulo: 'Vincular a um computador', icone: Link2, onClick: () => setVinculando(maquina), disabled: ocupado },
                        { rotulo: 'Atualizar agora', icone: RefreshCw, onClick: () => onAtualizar(maquina), disabled: ocupado },
                        !asset && onExcluir && {
                          rotulo: 'Excluir', icone: Trash2, onClick: () => onExcluir(maquina), disabled: ocupado, perigo: true,
                        },
                      ]}
                    />
                  </TableCellAcoes>
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
            frase={FRASE_DA_LISTA_VAZIA[vista]}
          />
        )}
      </Card>

      {/* Fora da tabela: a última máquina sair da lista não pode
          remontar o painel, que perderia a frase da recusa e o que foi escolhido. */}
      {vinculando && (
        <VincularMaquinaForm
          maquina={vinculando}
          ocupado={ocupado}
          onVincular={onVincular}
          onCancelar={() => setVinculando(null)}
        />
      )}
    </>
  );
}

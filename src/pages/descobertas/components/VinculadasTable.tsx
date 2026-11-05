import { useNavigate } from 'react-router-dom';
import { MonitorCheck } from 'lucide-react';
import EstadoDaLista from '../../../components/EstadoDaLista';
import { PontoDeStatus } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
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
}

export default function VinculadasTable({ maquinas, carregando, erro }: Props) {
  const navigate = useNavigate();

  if (maquinas.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-text-tertiary">
        <MonitorCheck className="size-6 opacity-50" />
        <EstadoDaLista carregando={carregando} erro={erro}>
          <span>Nenhuma máquina vinculada a um ativo ainda.</span>
          <span className="text-xs">O vínculo nasce aceitando uma sugestão, ou à mão, em "Sem vínculo".</span>
        </EstadoDaLista>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Máquina</TableHead>
            <TableHead>Ativo</TableHead>
            <TableHead>Sistema</TableHead>
            <TableHead>Agente</TableHead>
            <TableHead>Último contato</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {maquinas.map((maquina) => {
            // `asset` pode faltar só na linha que o `SetNull` desfez entre duas
            // revalidações: sem ficha para abrir, a linha não clica.
            const { asset } = maquina;
            const online = maquina.status === 'ONLINE';

            return (
              <TableRow
                key={maquina.id}
                onClick={asset ? () => navigate(`/computadores/${asset.id}`) : undefined}
                className={asset ? 'cursor-pointer' : undefined}
              >
                <TableCell>
                  {/* O botão é o caminho do teclado: o clique sobe para a linha. */}
                  {asset ? (
                    <button type="button" className="text-left font-medium text-text-primary focus-visible:underline focus-visible:outline-none">
                      {maquina.hostname}
                    </button>
                  ) : (
                    <span className="font-medium text-text-primary">{maquina.hostname}</span>
                  )}
                </TableCell>
                <TableCell>
                  {asset ? (
                    <>
                      <span className="font-mono text-text-primary">{asset.assetTag}</span>
                      {asset.name && <div className="mt-0.5 text-xs text-text-tertiary">{asset.name}</div>}
                    </>
                  ) : (
                    <span className="text-text-tertiary">vínculo desfeito</span>
                  )}
                </TableCell>
                <TableCell>{maquina.osVersion}</TableCell>
                <TableCell>
                  <PontoDeStatus tom={online ? 'sucesso' : 'neutro'}>{online ? 'Online' : 'Offline'}</PontoDeStatus>
                </TableCell>
                <TableCell className="text-text-tertiary">
                  {new Date(maquina.lastSeen).toLocaleString('pt-BR')}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

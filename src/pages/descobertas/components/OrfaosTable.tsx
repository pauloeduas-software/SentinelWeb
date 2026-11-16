import { useState, type ReactNode } from 'react';
import { HelpCircle, Link2 } from 'lucide-react';
import VincularMaquinaForm from './VincularMaquinaForm';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import ListaVazia from '../../../components/ListaVazia';
import ListToolbar from '../../../components/ListToolbar';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeadAcoes, TableHeader, TableNome, TableRow, TableSublinha } from '../../../components/ui/table';
import { formatarDataHora } from '../../../helpers/format.helper';
import { useListaLocalNaUrl } from '../../../hooks/usePaginaLocal';
import type { Endpoint } from '../../../types/endpoint.types';

// AS MÁQUINAS QUE O AGENTE VÊ E O CADASTRO NÃO CONHECE: o computador que já
// tem o agente e ainda não virou patrimônio. Só tem agente a máquina em que a TI
// pôs o segredo de instalação (CR); a que não é da empresa sai revogando o token.
//
// O VÍNCULO é a ação da linha: dizer que esta máquina É um computador — e, se
// quiser, entregá-lo ao posto na mesma ida. A fila de sugestões só alcança a
// máquina que a cascata casou com alguma coisa; a que chegou com serial em
// branco e um nome que não bate só sai daqui por este botão.
//
// A linha não clica: sem computador, não há ficha para abrir, e a ação fica no `⋯`.

interface Props {
  orfaos: Endpoint[];
  carregando: boolean;
  erro: string | null;
  ocupado: boolean;
  acao: ReactNode;
  onVincular: (endpointId: string, assetId: string, targetWorkstationId: string | null) => Promise<void>;
}

export default function OrfaosTable({ orfaos, carregando, erro, ocupado, acao, onVincular }: Props) {
  // A MÁQUINA NO PAINEL DE VÍNCULO: a linha, e não o id. Quando a entrega é recusada
  // o vínculo fica, e a máquina sai desta lista na revalidação; o painel precisa
  // sobreviver a isso para dizer que só metade aconteceu.
  const [vinculando, setVinculando] = useState<Endpoint | null>(null);
  const lista = useListaLocalNaUrl(orfaos, (orfao) => `${orfao.hostname} ${orfao.osVersion} ${orfao.biosSerial ?? ''}`);

  return (
    <>
      <ListToolbar
        search={lista.search}
        onSearchChange={lista.changeSearch}
        placeholder="Buscar por máquina, sistema ou série…"
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
              <TableHead>Sistema operacional</TableHead>
              <TableHead className="w-48">Último contato</TableHead>
              <TableHeadAcoes />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.visiveis.map((orfao) => (
              <TableRow key={orfao.id}>
                <TableCell>
                  <TableNome>{orfao.hostname}</TableNome>
                  {orfao.biosSerial && <TableSublinha className="font-mono">{orfao.biosSerial}</TableSublinha>}
                </TableCell>
                <TableCell>{orfao.osVersion}</TableCell>
                <TableCell>{formatarDataHora(orfao.lastSeen)}</TableCell>
                <TableCell>
                  <AcoesDaLinha
                    nome={orfao.hostname}
                    acoes={[{
                      rotulo: 'Vincular a um computador',
                      icone: Link2,
                      onClick: () => setVinculando(orfao),
                      disabled: ocupado,
                    }]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {lista.total === 0 && (
          <ListaVazia
            icone={HelpCircle}
            carregando={carregando}
            erro={erro}
            nome="máquina"
            genero="f"
            busca={lista.search}
            frase="Nenhuma máquina sem vínculo."
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

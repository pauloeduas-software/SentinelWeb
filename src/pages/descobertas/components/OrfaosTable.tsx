import { useState } from 'react';
import { Check, Ban, HelpCircle, Link2 } from 'lucide-react';
import VincularMaquinaForm from './VincularMaquinaForm';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import EstadoDaLista from '../../../components/EstadoDaLista';
import { PontoDeStatus } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import type { Endpoint } from '../../../types/endpoint.types';
import type { ReviewState } from '../../../types/reconciliation.types';

// AS MÁQUINAS QUE O AGENTE VÊ E O CADASTRO NÃO CONHECE — o Shadow IT, e o
// computador novo que ainda não virou patrimônio.
//
// DUAS AÇÕES por linha, e são conversas diferentes. A TRIAGEM não mexe na
// máquina: `ALLOWED` é "eu sei o que é isso", `BLOCKED` é "isto não deveria
// estar na rede"; o valor dela é tirar da fila o que já foi olhado, senão a
// mesma máquina conhecida reaparece como "não autorizada" toda semana. O
// VÍNCULO é o contrário: é dizer que esta máquina É um ativo — e, se quiser,
// entregá-la ao posto na mesma ida. A fila de sugestões só alcança a máquina
// que a cascata casou com alguma coisa; a que chegou com serial em branco e um
// nome que não bate só sai daqui por este botão.
//
// Nenhuma das duas desliga ninguém remotamente — o comando remoto mora na ficha
// do ativo a que a máquina está vinculada, e numa máquina desta lista, por
// definição, não está. Pelo mesmo motivo a linha não clica: sem ativo, não há
// ficha para abrir, e as ações ficam no `⋯`.

interface Props {
  orfaos: Endpoint[];
  carregando: boolean;
  erro: string | null;
  ocupado: boolean;
  onTriar: (id: string, reviewState: ReviewState) => void;
  onVincular: (endpointId: string, assetId: string, targetWorkstationId: string | null) => Promise<void>;
}

const SITUACAO: Record<ReviewState, { rotulo: string; tom: 'aviso' | 'sucesso' | 'perigo' }> = {
  UNREVIEWED: { rotulo: 'Sem triagem', tom: 'aviso' },
  ALLOWED: { rotulo: 'Conhecida', tom: 'sucesso' },
  BLOCKED: { rotulo: 'Não autorizada', tom: 'perigo' },
};

export default function OrfaosTable({ orfaos, carregando, erro, ocupado, onTriar, onVincular }: Props) {
  // A MÁQUINA NO PAINEL DE VÍNCULO: a linha, e não o id. Quando a entrega é recusada
  // o vínculo fica, e a máquina sai desta lista na revalidação; o painel precisa
  // sobreviver a isso para dizer que só metade aconteceu.
  const [vinculando, setVinculando] = useState<Endpoint | null>(null);

  return (
    <>
      {orfaos.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-text-tertiary">
          <HelpCircle className="size-6 opacity-50" />
          <EstadoDaLista carregando={carregando} erro={erro}>
            <span>Nenhuma máquina sem vínculo.</span>
          </EstadoDaLista>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Máquina</TableHead>
                <TableHead>Sistema</TableHead>
                <TableHead>Série</TableHead>
                <TableHead>Último contato</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-12 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orfaos.map((orfao) => {
                const situacao = SITUACAO[orfao.reviewState ?? 'UNREVIEWED'];
                return (
                  <TableRow key={orfao.id}>
                    <TableCell className="font-medium text-text-primary">{orfao.hostname}</TableCell>
                    <TableCell>{orfao.osVersion}</TableCell>
                    <TableCell className="font-mono text-text-tertiary">{orfao.biosSerial ?? '—'}</TableCell>
                    <TableCell className="text-text-tertiary">
                      {new Date(orfao.lastSeen).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell><PontoDeStatus tom={situacao.tom}>{situacao.rotulo}</PontoDeStatus></TableCell>
                    <TableCell>
                      <AcoesDaLinha
                        nome={orfao.hostname}
                        acoes={[
                          {
                            rotulo: 'Vincular a um ativo',
                            icone: Link2,
                            onClick: () => setVinculando(orfao),
                            disabled: ocupado,
                          },
                          {
                            rotulo: 'Conheço esta máquina',
                            icone: Check,
                            onClick: () => onTriar(orfao.id, 'ALLOWED'),
                            disabled: ocupado,
                          },
                          {
                            rotulo: 'Não deveria estar na rede',
                            icone: Ban,
                            onClick: () => onTriar(orfao.id, 'BLOCKED'),
                            disabled: ocupado,
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
      )}

      {/* Fora dos dois lados do `?`: a última máquina sair da lista não pode
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

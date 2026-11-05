import { useNavigate } from 'react-router-dom';
import { BatteryWarning } from 'lucide-react';
import EstadoDaLista from '../../../components/EstadoDaLista';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
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
  erro: string | null;
}

export default function OciososTable({ ociosos, erro }: Props) {
  const navigate = useNavigate();

  if (ociosos.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-text-tertiary">
        <BatteryWarning className="size-6 opacity-50" />
        <EstadoDaLista carregando={false} erro={erro}>
          <span>Nenhum ativo ocioso nos últimos 30 dias.</span>
          <span className="text-xs">Só entram aqui ativos com agente.</span>
        </EstadoDaLista>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ativo</TableHead>
            <TableHead>Máquina</TableHead>
            <TableHead>Último uso</TableHead>
            <TableHead>Quem responde</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ociosos.map((ativo) => (
            <TableRow
              key={ativo.assetId}
              onClick={() => navigate(`/computadores/${ativo.assetId}`)}
              className="cursor-pointer"
            >
              <TableCell>
                {/* O botão é o caminho do teclado: o clique sobe para a linha. */}
                <button type="button" className="text-left font-mono font-medium text-text-primary focus-visible:underline focus-visible:outline-none">
                  {ativo.assetTag}
                </button>
                {ativo.name && <div className="mt-0.5 text-xs text-text-tertiary">{ativo.name}</div>}
              </TableCell>
              <TableCell>{ativo.hostname ?? '—'}</TableCell>
              <TableCell className="text-text-tertiary">
                {ativo.ultimoUso ? `${ativo.ultimoUso} (${ativo.diasSemUso} dias)` : 'nunca registrado'}
              </TableCell>
              <TableCell>
                {ativo.postoVago ? (
                  <Badge tom="aviso">Posto vago: ninguém responde</Badge>
                ) : ativo.responsaveis.length > 0 ? (
                  ativo.responsaveis.map((pessoa) => pessoa.name).join(', ')
                ) : (
                  <span className="text-text-tertiary">não entregue</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

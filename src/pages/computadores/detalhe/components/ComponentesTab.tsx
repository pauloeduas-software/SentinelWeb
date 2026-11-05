import { Cpu } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Aviso } from '../../../../components/ui/aviso';
import { Card } from '../../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import type { EntregaNaFicha } from '../../../../types/stock.types';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import { caminhoDoItem, textoDeUnidades } from '../../../../helpers/estoque.helper';

// A ABA COMPONENTES — "o que está instalado NESTA máquina agora" (AI): a
// memória, o SSD. Uma linha por entrega, como a ficha do posto.
//
// SÓ AS ENTREGAS ABERTAS: as já retiradas estão na aba Histórico. O componente
// fica no computador mesmo quando ele muda de mãos — a peça está dentro dele.
//
// SEM RETIRAR: ele mora no detalhe do item, como a devolução de licença mora na
// tela de Licenças. A linha do item leva até lá, já filtrada por este computador.

interface ComponentesTabProps {
  componentes: EntregaNaFicha[];
  /** A etiqueta do computador: o link leva ao detalhe do item já filtrado por ela. */
  assetTag: string;
  carregando: boolean;
  erro: string | null;
}

export default function ComponentesTab({ componentes, assetTag, carregando, erro }: ComponentesTabProps) {
  const navegar = useNavigate();

  if (carregando) return <p className="text-sm text-text-tertiary">Carregando componentes…</p>;
  if (erro) return <Aviso>Não foi possível carregar os componentes: {erro}</Aviso>;

  if (componentes.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-text-tertiary">
        <Cpu className="size-6 opacity-50" />
        <span>Nenhum componente instalado neste ativo.</span>
        <span className="max-w-md text-center text-xs leading-relaxed">
          Memória e SSD são itens de categoria Componente, entregues a um computador pela tela de{' '}
          <Link to="/estoque" className="text-primary hover:underline">Estoque</Link>.
        </span>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Componente</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Quantidade</TableHead>
            <TableHead>Desde</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {componentes.map((entrega) => {
            const caminho = caminhoDoItem(entrega.item.id, assetTag);
            return (
              <TableRow key={entrega.id} onClick={() => navegar(caminho)} className="cursor-pointer">
                <TableCell>
                  {/* O link é o caminho do teclado; o clique nele não sobe, senão navegaria duas vezes. */}
                  <Link to={caminho} onClick={(evento) => evento.stopPropagation()} className="font-medium text-text-primary focus-visible:underline focus-visible:outline-none">
                    {entrega.item.name}
                  </Link>
                  {entrega.notes && (
                    <div className="mt-0.5 text-xs text-text-tertiary">{entrega.notes}</div>
                  )}
                </TableCell>
                <TableCell>{entrega.item.category.name}</TableCell>
                <TableCell>{textoDeUnidades(entrega.unidades)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatarDiaDoInstante(entrega.checkoutAt)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

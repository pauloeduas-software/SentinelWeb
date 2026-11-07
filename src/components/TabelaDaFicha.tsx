import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BarraDaFicha from './BarraDaFicha';
import ListaVazia from './ListaVazia';
import { usePaginaLocal } from '../hooks/usePaginaLocal';
import { useVoltaParaEstaFicha } from '../hooks/useVoltaComFiltros';
import { Card } from './ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableLinha, TableNome, TableRow, TableSublinha,
} from './ui/table';

// A TABELA DE UMA ABA DA FICHA: o que está com o registro, e a linha inteira abre o que
// ela mostra. A devolução mora lá, no registro de cada coisa.

export interface ColunaDaFicha {
  rotulo: string;
  /** A largura, como no `TableHead`. Sem ela, a coluna divide o que sobrou. */
  className?: string;
}

export interface LinhaDaFicha {
  id: string;
  para?: string;
  /** O nome na primeira coluna, e a nota embaixo dele. */
  nome: ReactNode;
  nota?: ReactNode;
  celulas: readonly ReactNode[];
}

interface TabelaDaFichaProps {
  colunas: readonly ColunaDaFicha[];
  linhas: readonly LinhaDaFicha[];
  icone: LucideIcon;
  vazio: string;
  carregando?: boolean;
  erro?: string | null;
  /** A explicação embaixo da frase, com a aba vazia. */
  children?: ReactNode;
}

export default function TabelaDaFicha({
  colunas, linhas, icone, vazio, carregando = false, erro = null, children,
}: TabelaDaFichaProps) {
  const navigate = useNavigate();
  const volta = useVoltaParaEstaFicha();
  const pagina = usePaginaLocal(linhas);

  return (
    <>
      <BarraDaFicha page={pagina.page} total={pagina.total} onPageChange={pagina.setPage} />
      <Card className="overflow-hidden">
        <Table className={colunas.length > 4 ? 'min-w-[52rem]' : 'min-w-[40rem]'}>
          <TableHeader>
            <TableRow>
              {colunas.map(({ rotulo, className }) => <TableHead key={rotulo} className={className}>{rotulo}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagina.visiveis.map(({ id, para, nome, nota, celulas }) => (
              <TableRow key={id} onClick={para ? () => navigate(para, { state: volta }) : undefined}>
                <TableCell>
                  {para ? <TableNome>{nome}</TableNome> : <TableLinha className="font-medium text-text-primary">{nome}</TableLinha>}
                  {nota && <TableSublinha>{nota}</TableSublinha>}
                </TableCell>
                {celulas.map((celula, indice) => <TableCell key={indice}>{celula}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {linhas.length === 0 && (
          <ListaVazia icone={icone} carregando={carregando} erro={erro} frase={vazio}>{children}</ListaVazia>
        )}
      </Card>
    </>
  );
}

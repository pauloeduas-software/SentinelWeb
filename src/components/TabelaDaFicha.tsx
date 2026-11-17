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
  type ApareceEm, type TipoDeColuna,
} from './ui/table';

// A TABELA DE UMA ABA DA FICHA: o que está com o registro, e a linha inteira abre o que
// ela mostra. A devolução mora lá, no registro de cada coisa.

export interface ColunaDaFicha {
  rotulo: string;
  /** O tipo, que dá a largura, como no `TableHead`. Sem ele, a coluna divide o que sobrou. */
  coluna?: TipoDeColuna;
  /** A partir de que largura da moldura ela aparece, como nas listas (DH). */
  aparece?: ApareceEm;
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
        <Table>
          <TableHeader>
            <TableRow>
              {colunas.map(({ rotulo, coluna, aparece }) => <TableHead key={rotulo} coluna={coluna} aparece={aparece}>{rotulo}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagina.visiveis.map(({ id, para, nome, nota, celulas }) => (
              <TableRow key={id} onClick={para ? () => navigate(para, { state: volta }) : undefined}>
                <TableCell coluna={colunas[0]?.coluna} aparece={colunas[0]?.aparece}>
                  {para ? <TableNome>{nome}</TableNome> : <TableLinha className="font-medium text-text-primary">{nome}</TableLinha>}
                  {nota && <TableSublinha>{nota}</TableSublinha>}
                </TableCell>
                {celulas.map((celula, indice) => (
                  <TableCell key={indice} coluna={colunas[indice + 1]?.coluna} aparece={colunas[indice + 1]?.aparece}>{celula}</TableCell>
                ))}
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

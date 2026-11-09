import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Inbox, X } from 'lucide-react';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import ListaVazia from '../../../components/ListaVazia';
import ListToolbar from '../../../components/ListToolbar';
import { Card } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeadAcoes, TableHeader, TableLinha, TableNome, TableRow, TableSublinha } from '../../../components/ui/table';
import { useListaLocalNaUrl } from '../../../hooks/usePaginaLocal';
import { comFiltros } from '../../../hooks/useVoltaComFiltros';
import type { Sugestao } from '../../../types/reconciliation.types';
import { ROTULO_DO_SINAL, textoDaSugestao, valorDoSinal } from '../helpers/sugestao.helper';

// A FILA DE SUGESTÕES, no molde de toda lista: a evidência fica na linha, com o
// sinal que casou e o valor dele, e a decisão no `⋯`. Sugestão sem evidência visível é
// palpite, e ninguém deveria aceitar um palpite que reescreve o inventário.
//
// A LINHA INTEIRA LEVA À FICHA DO COMPUTADOR sugerido, como na lista Vinculadas.

interface Props {
  sugestoes: readonly Sugestao[];
  carregando: boolean;
  erro: string | null;
  ocupado: boolean;
  acao: ReactNode;
  onAceitar: (id: string) => void;
  onRecusar: (id: string) => void;
}

export default function SugestoesTable({ sugestoes, carregando, erro, ocupado, acao, onAceitar, onRecusar }: Props) {
  const navigate = useNavigate();
  const lista = useListaLocalNaUrl(sugestoes, textoDaSugestao);

  return (
    <>
      <ListToolbar
        search={lista.search}
        onSearchChange={lista.changeSearch}
        placeholder="Buscar por máquina, etiqueta ou série…"
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
              <TableHead>Sinal</TableHead>
              <TableHead className="w-24">Pontos</TableHead>
              <TableHeadAcoes />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.visiveis.map((sugestao) => {
              const { asset } = sugestao;
              const valor = valorDoSinal(sugestao);

              return (
                <TableRow key={sugestao.id} onClick={asset ? () => navigate(`/computadores/${asset.id}`, comFiltros(lista.parametros, '/descobertas')) : undefined}>
                  <TableCell><TableNome>{sugestao.endpoint.hostname}</TableNome></TableCell>
                  <TableCell>
                    {asset ? (
                      <>
                        <TableLinha className="font-mono text-text-primary">{asset.assetTag}</TableLinha>
                        {asset.serial && <TableSublinha className="font-mono">{asset.serial}</TableSublinha>}
                      </>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    {sugestao.signal ? (
                      <>
                        <TableLinha>{ROTULO_DO_SINAL[sugestao.signal]}</TableLinha>
                        {valor && <TableSublinha className="font-mono">{valor}</TableSublinha>}
                      </>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">{sugestao.score}</TableCell>
                  <TableCell>
                    <AcoesDaLinha
                      nome={sugestao.endpoint.hostname}
                      acoes={[
                        { rotulo: 'Aceitar', icone: Check, onClick: () => onAceitar(sugestao.id), disabled: ocupado },
                        { rotulo: 'Recusar', icone: X, onClick: () => onRecusar(sugestao.id), disabled: ocupado },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {lista.total === 0 && (
          <ListaVazia
            icone={Inbox}
            carregando={carregando}
            erro={erro}
            nome="sugestão"
            genero="f"
            busca={lista.search}
            frase="Nenhuma sugestão esperando decisão."
          >
            <span className="text-xs">A varredura roda de hora em hora.</span>
          </ListaVazia>
        )}
      </Card>
    </>
  );
}

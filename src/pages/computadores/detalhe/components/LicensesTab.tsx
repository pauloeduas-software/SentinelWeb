import { KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Aviso } from '../../../../components/ui/aviso';
import { Card } from '../../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import type { EntregaDoAlvo } from '../../../../types/license.types';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import { caminhoDaLicenca, textoDaSituacao } from '../../../../helpers/licenca.helper';

// A ABA LICENÇAS — "o que está licenciado NESTA máquina agora".
//
// SÓ AS ENTREGAS ABERTAS AO ATIVO: as que já foram devolvidas estão na aba
// Histórico; as da pessoa que responde pela máquina são dela, e ficam na ficha
// dela (AA).
//
// SEM DEVOLVER: a devolução mora só na tela de Licenças, e a linha de cada
// licença leva até o detalhe dela, onde está o botão.

interface LicensesTabProps {
  licencas: EntregaDoAlvo[];
  /** A etiqueta do computador: o link leva ao detalhe da licença já filtrado por ela. */
  assetTag: string;
  carregando: boolean;
  erro: string | null;
}

export default function LicensesTab({ licencas, assetTag, carregando, erro }: LicensesTabProps) {
  const navegar = useNavigate();

  if (carregando) return <p className="text-sm text-text-tertiary">Carregando licenças…</p>;
  if (erro) return <Aviso>Não foi possível carregar as licenças: {erro}</Aviso>;

  if (licencas.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-text-tertiary">
        <KeyRound className="size-6 opacity-50" />
        <span>Nenhuma licença entregue a este ativo.</span>
        <span className="max-w-md text-center text-xs leading-relaxed">
          Licença por computador vai para o ativo, pela tela de{' '}
          <Link to="/licencas" className="text-primary hover:underline">Licenças</Link>.
          A de assinatura de uma pessoa vai para o colaborador, e aparece na ficha dele.
        </span>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Licença</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Desde</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {licencas.map((entrega) => {
            const licenca = entrega.license;
            const caminho = caminhoDaLicenca(licenca.id, assetTag);
            return (
              <TableRow key={entrega.id} onClick={() => navegar(caminho)} className="cursor-pointer">
                <TableCell>
                  {/* O link é o caminho do teclado; o clique nele não sobe, senão navegaria duas vezes. */}
                  <Link to={caminho} onClick={(evento) => evento.stopPropagation()} className="font-medium text-text-primary focus-visible:underline focus-visible:outline-none">
                    {licenca.name}
                  </Link>
                  {entrega.checkoutNotes && (
                    <div className="mt-0.5 text-xs text-text-tertiary">{entrega.checkoutNotes}</div>
                  )}
                </TableCell>
                <TableCell>{licenca.category?.name ?? '—'}</TableCell>
                <TableCell>{textoDaSituacao(entrega)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatarDiaDoInstante(entrega.checkoutAt)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

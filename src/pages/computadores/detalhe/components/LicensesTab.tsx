import { KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { EntregaDoAlvo } from '../../../../domain/shared/license.types';
import { formatarDiaDoInstante } from '../../../helpers/format.helper';
import { caminhoDaLicenca, textoDaSituacao } from '../../../helpers/licenca.helper';

// A ABA LICENÇAS — "o que está licenciado NESTA máquina agora".
//
// SÓ AS ENTREGAS ABERTAS AO ATIVO: as que já foram devolvidas estão na aba
// Histórico; as da pessoa que responde pela máquina são dela, e ficam na ficha
// dela (AA).
//
// SEM DEVOLVER: a devolução mora só na tela de Licenças, e o nome de cada
// licença leva até o detalhe dela, onde está o botão.

interface LicensesTabProps {
  licencas: EntregaDoAlvo[];
  /** A etiqueta do computador: o link leva ao detalhe da licença já filtrado por ela. */
  assetTag: string;
  carregando: boolean;
  erro: string | null;
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

export default function LicensesTab({ licencas, assetTag, carregando, erro }: LicensesTabProps) {
  if (carregando) return <p className="text-text-tertiary">Carregando licenças…</p>;
  if (erro) return <p role="alert" className="text-status-danger">Não foi possível carregar as licenças: {erro}</p>;

  if (licencas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary gap-3">
        <KeyRound size={24} className="opacity-50" />
        <span>Nenhuma licença entregue a este ativo.</span>
        <span className="text-[10px] max-w-md text-center leading-relaxed">
          Licença por computador vai para o ativo, pela tela de{' '}
          <Link to="/licencas" className="text-text-secondary underline-offset-2 hover:underline">Licenças</Link>.
          A de assinatura de uma pessoa vai para o colaborador, e aparece na ficha dele.
        </span>
      </div>
    );
  }

  return (
    <div className="border border-border-sutil bg-surface-card overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead className="border-b border-border-sutil bg-bg-base/40">
          <tr>
            <th className={CABECALHO}>Licença</th>
            <th className={CABECALHO}>Categoria</th>
            <th className={CABECALHO}>Situação</th>
            <th className={CABECALHO}>Desde</th>
          </tr>
        </thead>
        <tbody>
          {licencas.map((entrega) => {
            const licenca = entrega.license;
            return (
              <tr key={entrega.id} className="border-b border-border-sutil/50 last:border-0">
                <td className="px-3 py-2">
                  <Link to={caminhoDaLicenca(licenca.id, assetTag)} className="text-text-primary hover:underline underline-offset-2">
                    {licenca.name}
                  </Link>
                  {entrega.checkoutNotes && (
                    <div className="text-[10px] text-text-secondary mt-0.5">{entrega.checkoutNotes}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-text-secondary">{licenca.category?.name ?? '—'}</td>
                <td className="px-3 py-2 text-text-secondary">{textoDaSituacao(entrega)}</td>
                <td className="px-3 py-2 text-text-tertiary">{formatarDiaDoInstante(entrega.checkoutAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

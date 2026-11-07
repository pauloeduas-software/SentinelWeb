import { KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatusDaEntrega from '../../../../components/StatusDaEntrega';
import TabelaDaFicha from '../../../../components/TabelaDaFicha';
import type { EntregaDoAlvo } from '../../../../types/license.types';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import { caminhoDaLicenca, prazoDaEntrega } from '../../../../helpers/licenca.helper';

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
  /** A etiqueta do computador: o link leva à ficha da licença já filtrada por ela. */
  assetTag: string;
  carregando: boolean;
  erro: string | null;
}

export default function LicensesTab({ licencas, assetTag, carregando, erro }: LicensesTabProps) {
  return (
    <TabelaDaFicha
      colunas={[{ rotulo: 'Licença' }, { rotulo: 'Categoria', className: 'w-[24%]' }, { rotulo: 'Vencimento', className: 'w-44' }, { rotulo: 'Status', className: 'w-36' }, { rotulo: 'Desde', className: 'w-32' }]}
      icone={KeyRound}
      carregando={carregando}
      erro={erro}
      vazio="Nenhuma licença entregue a este ativo."
      linhas={licencas.map((entrega) => ({
        id: entrega.id,
        para: caminhoDaLicenca(entrega.license.id, assetTag),
        nome: entrega.license.name,
        nota: entrega.checkoutNotes,
        celulas: [entrega.license.category?.name ?? '—', prazoDaEntrega(entrega), <StatusDaEntrega status={entrega.status} />, formatarDiaDoInstante(entrega.checkoutAt)],
      }))}
    >
      <span className="max-w-md text-center text-xs leading-relaxed">
        Licença por computador vai para o ativo, pela tela de{' '}
        <Link to="/licencas" className="text-link hover:underline">Licenças</Link>.
        A de assinatura de uma pessoa vai para o colaborador, e aparece na ficha dele.
      </span>
    </TabelaDaFicha>
  );
}

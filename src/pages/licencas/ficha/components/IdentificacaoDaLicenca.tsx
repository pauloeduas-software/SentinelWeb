import type { ReactNode } from 'react';
import { KeyRound } from 'lucide-react';
import CartaoDaFicha, { IconeDaFicha } from '../../../../components/CartaoDaFicha';
import { PontoDeStatus } from '../../../../components/ui/badge';
import { Dado, GrupoDeDados } from '../../../../components/ui/dado';
import { formatarData, formatarDiaDoInstante } from '../../../../helpers/format.helper';
import {
  ROTULO_DO_STATUS, TOM_DO_STATUS, resumoDaContagem, textoDoPrazo, textoDoValorDaCompra,
} from '../../../../helpers/licenca.helper';
import type { Licenca } from '../../../../types/license.types';

// O CARD DE IDENTIFICAÇÃO: o que responde "que licença é esta e quantas sobraram" antes
// de qualquer aba, com todos os campos do cadastro. O vazio não aparece (`Dado`).
//
// OS GRUPOS SÃO OS DO COMPUTADOR (BS): a situação e a quem a licença está registrada,
// o catálogo com o Cadastrado em, e a compra.

interface Props {
  licenca: Licenca;
  acoes?: ReactNode;
}

export default function IdentificacaoDaLicenca({ licenca, acoes }: Props) {
  return (
    <CartaoDaFicha marca={<IconeDaFicha><KeyRound /></IconeDaFicha>} acoes={acoes}>
      <GrupoDeDados>
        <Dado rotulo="Status">
          <PontoDeStatus tom={TOM_DO_STATUS[licenca.status]}>{ROTULO_DO_STATUS[licenca.status]}</PontoDeStatus>
        </Dado>
        <Dado rotulo="Quantidade">{resumoDaContagem(licenca)}</Dado>
        <Dado rotulo="Vencimento">
          {licenca.expirationDate && (
            <>
              {formatarData(licenca.expirationDate)}
              {licenca.status !== 'ENCERRADA' && <span className="text-text-tertiary"> · {textoDoPrazo(licenca.diasParaVencer)}</span>}
            </>
          )}
        </Dado>
        <Dado rotulo="Encerramento">{formatarData(licenca.terminationDate)}</Dado>
        <Dado rotulo="Licenciado para">{licenca.licensedToName}</Dado>
        <Dado rotulo="E-mail do licenciado">{licenca.licensedToEmail}</Dado>
      </GrupoDeDados>
      <GrupoDeDados>
        <Dado rotulo="Categoria">{licenca.category?.name}</Dado>
        <Dado rotulo="Fabricante">{licenca.manufacturer?.name}</Dado>
        {/* `createdAt` é instante: o dia sai no fuso de Brasília, não em UTC. */}
        <Dado rotulo="Cadastrado em">{formatarDiaDoInstante(licenca.createdAt)}</Dado>
      </GrupoDeDados>
      <GrupoDeDados>
        <Dado rotulo="Número do pedido">{licenca.orderNumber}</Dado>
        <Dado rotulo="Data da compra">{formatarData(licenca.purchaseDate)}</Dado>
        {/* Ausente para quem não vê o custo (D77, AV): o campo some, e não diz "sem valor". */}
        <Dado rotulo="Valor da compra">{textoDoValorDaCompra(licenca)}</Dado>
      </GrupoDeDados>
      <Dado rotulo="Notas" largo>{licenca.notes}</Dado>
    </CartaoDaFicha>
  );
}

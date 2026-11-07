import type { ReactNode } from 'react';
import { Monitor } from 'lucide-react';
import CartaoDaFicha, { IconeDaFicha } from '../../../../components/CartaoDaFicha';
import { PontoDeStatus } from '../../../../components/ui/badge';
import { Dado, GrupoDeDados } from '../../../../components/ui/dado';
import { formatarData, formatarDiaDoInstante, formatarMoeda } from '../../../../helpers/format.helper';
import type { Asset } from '../../../../types/asset.types';
import { seloDaSaida } from '../../helpers/baixa.helper';
import { tomDoStatus } from '../../../../helpers/status.helper';
import { nomeDoResponsavel } from '../../../../helpers/responsavel.helper';
import { canaisDeSuporte, type CanalDeSuporte } from '../helpers/suporte.helper';

// O CARD DE IDENTIFICAÇÃO: o que responde "que máquina é esta, de quem é e onde
// está" antes de qualquer aba, com todos os campos do cadastro. Só leitura: editar é
// o formulário que já existe. O vazio não aparece (`Dado`).

export default function IdentificacaoCard({ asset, acoes }: { asset: Asset; acoes: ReactNode }) {
  // Cálculo fora do JSX (docs/referencia/arquitetura.md).
  const selo = seloDaSaida(asset);
  const canais = canaisDeSuporte(asset.model.manufacturer);

  return (
    <CartaoDaFicha marca={<IconeDaFicha><Monitor /></IconeDaFicha>} acoes={acoes}>
      <GrupoDeDados>
        <Dado rotulo="Status">
          {/* O baixado diz quando saiu, como na lista. */}
          {selo
            ? <PontoDeStatus tom="aviso">{selo}</PontoDeStatus>
            : <PontoDeStatus tom={tomDoStatus(asset.status.type)}>{asset.status.name}</PontoDeStatus>}
        </Dado>
        <Dado rotulo="Número de série">
          {asset.serial && <span className="font-mono">{asset.serial}</span>}
        </Dado>
        <Dado rotulo="Nome / apelido">{asset.name}</Dado>
        <Dado rotulo="Responsáveis">{nomeDoResponsavel(asset.posse)}</Dado>
        {/* NUM POSTO, o computador está onde o posto fica (AW). */}
        <Dado rotulo="Localização">
          {asset.postoAtual ? `${asset.postoAtual.location.name} · ${asset.postoAtual.name}` : asset.location?.name}
        </Dado>
      </GrupoDeDados>
      <GrupoDeDados>
        <Dado rotulo="Modelo">{asset.model.name}</Dado>
        <Dado rotulo="Fabricante">{asset.model.manufacturer.name}</Dado>
        {/* A categoria vem do MODELO, não de coluna própria — é o que impede
            ativo e modelo divergirem (asset-select.helper.ts). */}
        <Dado rotulo="Categoria">{asset.model.category.name}</Dado>
        {/* Para onde volta na devolução: a localização atual e a padrão do Snipe-IT. */}
        {asset.postoAtual && <Dado rotulo="Volta para">{asset.location?.name}</Dado>}
        {/* `createdAt` é instante: o dia sai no fuso de Brasília, não em UTC. */}
        <Dado rotulo="Cadastrado em">{formatarDiaDoInstante(asset.createdAt)}</Dado>
      </GrupoDeDados>
      <GrupoDeDados>
        <Dado rotulo="Número do pedido">{asset.orderNumber}</Dado>
        <Dado rotulo="Data da compra">{formatarData(asset.purchaseDate)}</Dado>
        {/* Ausente para quem não vê o custo (D77): o campo some, e não diz "sem valor". */}
        <Dado rotulo="Valor da compra">{formatarMoeda(asset.purchaseCost)}</Dado>
        {canais.map((canal) => <CampoDeCanal key={canal.rotulo} canal={canal} />)}
      </GrupoDeDados>
      <Dado rotulo="Notas" largo>{asset.notes}</Dado>
    </CartaoDaFicha>
  );
}

/**
 * Um canal de suporte: o mesmo `Dado`. O site é o único link do card (BS), porque sai
 * do sistema.
 *
 * Abre em outra aba com `noopener noreferrer` — a página do fabricante não ganha acesso
 * a esta janela pelo `window.opener`, nem recebe a URL da ficha (com o id do ativo) no
 * `Referer`.
 */
function CampoDeCanal({ canal }: { canal: CanalDeSuporte }) {
  return (
    <Dado rotulo={canal.rotulo}>
      {canal.href ? (
        <a href={canal.href} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
          {canal.texto}
        </a>
      ) : canal.texto}
    </Dado>
  );
}

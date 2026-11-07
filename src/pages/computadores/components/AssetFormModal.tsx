import { useState } from 'react';
import CampoDeDinheiro from '../../../components/CampoDeDinheiro';
import FormularioLateral from '../../../components/FormularioLateral';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { Campo } from '../../../components/ui/campo';
import { Input, Textarea } from '../../../components/ui/input';
import { hojeNoCampoDeData, paraCampoDeData } from '../../../helpers/format.helper';
import { useNextAssetTagQuery, type AssetInput } from '../../../queries/asset.queries';
import { usePode } from '../../../stores/auth.store';
import type { Asset } from '../../../types/asset.types';

// POSSE NÃO É CAMPO DESTE FORMULÁRIO — e a ausência é a decisão (D14,
// docs/referencia/modelo-de-posse.md).
//
// Não há campo "Responsável": um campo editável à mão AO LADO de uma tabela de
// posse são duas fontes de verdade para o mesmo fato, e nada impede divergirem.
// Pior, ele não sabe representar o que o modelo representa — um ativo entregue
// à Mesa 1 responde por DUAS pessoas (Laura de manhã, Ana à tarde), e um
// campo de uma pessoa só não tem onde guardar isso.
//
// Entregar e devolver são OPERAÇÃO: o `CheckoutModal`, no menu da linha do ativo
// e na ficha dele, e o `DevolucaoModal`, na aba Responsáveis.
//
// `locationId` continua aqui, e não é a mesma coisa: é ONDE o ativo está, não
// QUEM responde por ele. Entregue a um posto, ele está onde o posto fica, e o
// campo é para onde volta na devolução (AW).

/**
 * CLONAR limpa etiqueta e série, e só elas.
 *
 * As duas são ÚNICAS entre os vivos (índice parcial no banco): copiadas, o
 * servidor responderia 409 e o clone nunca gravaria. Todo o resto — modelo,
 * localização, valor, notas — é justamente o que se quer repetir ao cadastrar o
 * segundo notebook do mesmo lote.
 *
 * A posse NÃO é copiada porque nem está aqui: entregar é operação, não campo
 * (docs/referencia/modelo-de-posse.md). Um clone nasce sem posse, como deve.
 *
 * E por isso o STATUS também não é copiado: o status acompanha a posse. Clonar
 * um ativo entregue copiava o "Em uso" dele, e o clone nascia em uso sem estar
 * com ninguém — um ativo que nenhuma entrega deixaria assim, e que a trava de
 * entrega (só `DEPLOYABLE`) impedia de sair do estoque até alguém editar o
 * status à mão.
 */
function valoresIniciais(asset: Asset | null, clonar: boolean, statusPadraoId: string) {
  return {
    assetTag: clonar ? '' : asset?.assetTag ?? '',
    serial: clonar ? '' : asset?.serial ?? '',
    name: asset?.name ?? '',
    // Ativo NOVO nasce com o status de tipo "Disponível" (`DEPLOYABLE`; o id
    // vem do hook da página): o primeiro da lista alfabética pode ser de outro
    // tipo, e o cadastro mais comum — chegou, está no estoque — exigia trocar o campo
    // toda vez. O CLONE também é ativo novo e nasce assim (ver o docblock).
    // Só a edição mantém o status do ativo.
    statusId: clonar || !asset ? statusPadraoId : asset.statusId,
    modelId: asset?.modelId ?? '',
    locationId: asset?.locationId ?? '',
    orderNumber: asset?.orderNumber ?? '',
    purchaseDate: paraCampoDeData(asset?.purchaseDate),
    purchaseCost: asset?.purchaseCost ?? '',
    notes: asset?.notes ?? '',
  };
}

interface AssetFormModalProps {
  asset: Asset | null;
  /**
   * Clonar: abre com os valores de `asset`, mas GRAVA UM NOVO.
   *
   * É uma terceira intenção no mesmo formulário — criar, editar, clonar — e
   * precisa ser declarada: com `asset` preenchido, o modal não teria como
   * distinguir "editar este" de "criar outro igual a este".
   */
  clonar?: boolean;
  /**
   * O status de um ativo NOVO — cadastro ou clone. Vem de quem abre o modal
   * porque é o hook da página que consulta os status; as duas portas que criam
   * (a listagem e a ficha, que clona) o passam. Sem ele, o campo nasce em branco.
   */
  statusPadraoId?: string;
  onClose: () => void;
  onSubmit: (data: AssetInput) => Promise<void>;
}

export default function AssetFormModal({
  asset, clonar = false, statusPadraoId = '', onClose, onSubmit,
}: AssetFormModalProps) {
  const [valores, setValores] = useState(() => valoresIniciais(asset, clonar, statusPadraoId));
  // A versão DESTA abertura (AF): o registro pode chegar mais novo enquanto o
  // formulário está aberto (o clone é cadastro novo, sem versão), e o que ele mostra continua sendo o desta leitura.
  const [versao] = useState(asset && !clonar ? asset.updatedAt : undefined);
  // O CUSTO É DO SUPERVISOR (D77). Quem não é nem recebe o valor do servidor, então
  // o campo abriria vazio — e salvar mandaria esse vazio por cima do custo que
  // só o administrador enxerga. Sem o campo e sem a chave no corpo, edita-se o
  // resto sem tocar no dinheiro.
  const veCusto = usePode('SUPERVISOR');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Só quando vai CRIAR — inclusive clonando —, e é *peek*: o servidor NÃO
  // consome o número aqui. Se consumisse, abrir e cancelar o modal duas vezes
  // furaria a sequência de etiquetas.
  const { data: proxima } = useNextAssetTagQuery(!asset || clonar);

  const definir = (campo: string, valor: unknown) =>
    setValores((atual) => ({ ...atual, [campo]: valor }));

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const corpo: AssetInput = { ...valores, ...(versao ? { updatedAt: versao } : {}) };
      if (!veCusto) delete corpo.purchaseCost;
      await onSubmit(corpo);
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FormularioLateral
      titulo={clonar ? 'Clonar ativo' : asset ? 'Editar ativo' : 'Novo ativo'}
      descricao={clonar ? `Cópia de ${asset?.assetTag}. Etiqueta e número de série nascem em branco porque são únicos. A cópia nasce sem responsáveis.` : asset?.assetTag}
      onClose={onClose}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
    >
      <Secao titulo="Identificação">
        <Campo rotulo="Etiqueta">
          <Input
            value={valores.assetTag}
            onChange={(e) => definir('assetTag', e.target.value)}
            // Em branco, o servidor gera a etiqueta a partir do contador.
            placeholder={proxima ? `${proxima.assetTag} (automática)` : 'automática'}
            className="font-mono"
          />
        </Campo>
        <Campo rotulo="Número de série">
          <Input value={valores.serial} onChange={(e) => definir('serial', e.target.value)} className="font-mono" />
        </Campo>
        <Campo rotulo="Nome / apelido" className="sm:col-span-2">
          <Input value={valores.name} onChange={(e) => definir('name', e.target.value)} />
        </Campo>
      </Secao>

      <Secao titulo="Catálogo">
        {/* A CATEGORIA do ativo vem daqui: é a do modelo, não um campo à
            parte — é assim no Snipe-IT, e é o que impede os dois divergirem. */}
        <Campo rotulo="Modelo" obrigatorio>
          <ReferenceSelect rota="asset-models" valor={valores.modelId} obrigatorio atual={asset?.model} onChange={(v) => definir('modelId', v)} />
        </Campo>
        <Campo rotulo="Status" obrigatorio>
          <ReferenceSelect rota="status-labels" valor={valores.statusId} obrigatorio atual={asset?.status} onChange={(v) => definir('statusId', v)} />
        </Campo>
        {/* Num posto, o computador está onde o posto fica, e este campo
            é para onde ele volta na devolução (AW). O clone nasce fora
            de posto. */}
        <Campo
          rotulo="Localização"
          className="sm:col-span-2"
          ajuda={asset?.postoAtual && !clonar
            ? `Entregue ao posto ${asset.postoAtual.name} (${asset.postoAtual.location.name}). Este campo é para onde ele volta na devolução.`
            : 'Onde o ativo está. O responsável muda pelo Entregar, não aqui.'}
        >
          <ReferenceSelect rota="locations" valor={valores.locationId} atual={asset?.location} onChange={(v) => definir('locationId', v)} />
        </Campo>
      </Secao>

      <Secao titulo="Compra">
        <Campo rotulo="Número do pedido">
          <Input value={valores.orderNumber} onChange={(e) => definir('orderNumber', e.target.value)} />
        </Campo>
        <Campo rotulo="Data da compra">
          <Input type="date" max={hojeNoCampoDeData()} value={valores.purchaseDate} onChange={(e) => definir('purchaseDate', e.target.value)} />
        </Campo>
        {veCusto && (
          <Campo rotulo="Valor da compra">
            <CampoDeDinheiro valor={String(valores.purchaseCost)} onChange={(valor) => definir('purchaseCost', valor)} />
          </Campo>
        )}
      </Secao>

      <Campo rotulo="Notas">
        <Textarea value={valores.notes} onChange={(e) => definir('notes', e.target.value)} />
      </Campo>
    </FormularioLateral>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="w-full border-b border-border-sutil pb-2 text-sm font-medium text-text-primary">
        {titulo}
      </legend>
      <div className="mt-4 grid sm:grid-cols-2 gap-4">{children}</div>
    </fieldset>
  );
}

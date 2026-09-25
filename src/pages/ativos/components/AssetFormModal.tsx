import { useState } from 'react';
import { X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import { paraCampoDeData } from '../../helpers/format.helper';
import { useNextAssetTagQuery, type AssetInput } from '../../../domain/asset/asset.queries';
import type { Asset } from '../../../domain/shared/asset.types';

// POSSE NÃO É CAMPO DESTE FORMULÁRIO — e a ausência é a decisão (D14,
// docs/MODELO-POSSE.md).
//
// O campo "Responsável" existia aqui e foi removido na F4. `assignedToId` virou
// CACHE do caso `USER` da posse, escrito só pelo checkout e pelo checkin: um
// campo editável à mão AO LADO de uma tabela de posse são duas fontes de verdade
// para o mesmo fato, e nada impede divergirem. Pior, ele não sabe representar o
// que o modelo representa — um ativo entregue à Mesa 1 responde por DUAS pessoas
// (Laura de manhã, Ana à tarde), e um `<select>` de uma pessoa só não tem onde
// guardar isso.
//
// Entregar e devolver agora são OPERAÇÃO, pelo `CheckoutModal`, no botão da
// linha do ativo. O servidor recusa `assignedToId` no corpo de create/update.
//
// `locationId` continua aqui, e não é a mesma coisa: é ONDE o ativo está, não
// QUEM responde por ele. O mouse reserva na gaveta de uma mesa ocupada está NA
// mesa sem ser DA mesa.

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

/**
 * CLONAR limpa etiqueta e série, e só elas.
 *
 * As duas são ÚNICAS entre os vivos (índice parcial no banco): copiadas, o
 * servidor responderia 409 e o clone nunca gravaria. Todo o resto — modelo,
 * fornecedor, valor, garantia, notas — é justamente o que se quer repetir ao
 * cadastrar o segundo notebook do mesmo lote.
 *
 * A posse NÃO é copiada porque nem está aqui: entregar é operação, não campo
 * (docs/MODELO-POSSE.md). Um clone nasce no estoque, como deve.
 */
function valoresIniciais(asset: Asset | null, clonar: boolean) {
  return {
    assetTag: clonar ? '' : asset?.assetTag ?? '',
    serial: clonar ? '' : asset?.serial ?? '',
    name: asset?.name ?? '',
    statusId: asset?.statusId ?? '',
    modelId: asset?.modelId ?? '',
    locationId: asset?.locationId ?? '',
    supplierId: asset?.supplierId ?? '',
    // `assignedToId` NÃO está aqui, e a ausência é a regra: ver o comentário do
    // topo do arquivo. O servidor recusa o campo no corpo.
    orderNumber: asset?.orderNumber ?? '',
    purchaseDate: paraCampoDeData(asset?.purchaseDate),
    purchaseCost: asset?.purchaseCost ?? '',
    warrantyMonths: asset?.warrantyMonths == null ? '' : String(asset.warrantyMonths),
    eolMonths: asset?.eolMonths == null ? '' : String(asset.eolMonths),
    eolDate: paraCampoDeData(asset?.eolDate),
    eolExplicit: asset?.eolExplicit ?? false,
    byod: asset?.byod ?? false,
    requestable: asset?.requestable ?? false,
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
  onClose: () => void;
  onSubmit: (data: AssetInput) => Promise<void>;
}

export default function AssetFormModal({ asset, clonar = false, onClose, onSubmit }: AssetFormModalProps) {
  const [valores, setValores] = useState(() => valoresIniciais(asset, clonar));
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
      await onSubmit(valores);
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">
            {clonar && asset ? `Clonar ${asset.assetTag}` : asset ? `Editar ${asset.assetTag}` : 'Novo Ativo'}
          </h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 font-mono text-xs overflow-y-auto max-h-[78vh] space-y-6">
          {erro && (
            <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
          )}

          {clonar && (
            <p className="p-3 border border-border-sutil bg-bg-base/50 text-text-tertiary text-[10px] leading-relaxed">
              Cópia de {asset?.assetTag}: etiqueta e número de série nascem em branco porque são
              únicos. O clone entra no estoque, sem posse — entregar continua sendo operação.
            </p>
          )}

          <Secao titulo="Identificação">
            <div className="space-y-1">
              <label className={ROTULO}>Etiqueta</label>
              <input
                value={valores.assetTag}
                onChange={(e) => definir('assetTag', e.target.value)}
                // Em branco, o servidor gera a etiqueta a partir do contador.
                placeholder={proxima ? `${proxima.assetTag} (automática)` : 'automática'}
                className={CLASSE_CAMPO}
              />
            </div>
            <div className="space-y-1">
              <label className={ROTULO}>Número de série</label>
              <input
                value={valores.serial}
                onChange={(e) => definir('serial', e.target.value)}
                placeholder="Ex: 5CG1234ABC"
                className={CLASSE_CAMPO}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className={ROTULO}>Nome / apelido</label>
              <input
                value={valores.name}
                onChange={(e) => definir('name', e.target.value)}
                placeholder="Ex: Notebook da recepção"
                className={CLASSE_CAMPO}
              />
            </div>
          </Secao>

          <Secao titulo="Catálogo">
            <div className="space-y-1">
              <label className={ROTULO}>Modelo*</label>
              {/* A CATEGORIA do ativo vem daqui: é a do modelo, não um campo à
                  parte — é assim no Snipe-IT, e é o que impede os dois divergirem. */}
              <ReferenceSelect rota="asset-models" valor={valores.modelId} obrigatorio onChange={(v) => definir('modelId', v)} />
            </div>
            <div className="space-y-1">
              <label className={ROTULO}>Status*</label>
              <ReferenceSelect rota="status-labels" valor={valores.statusId} obrigatorio onChange={(v) => definir('statusId', v)} />
            </div>
            <div className="space-y-1">
              <label className={ROTULO}>Localização</label>
              <ReferenceSelect rota="locations" valor={valores.locationId} onChange={(v) => definir('locationId', v)} />
              <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                Onde o ativo ESTÁ. Não é quem responde por ele.
              </p>
            </div>
            <p className="col-span-2 text-text-tertiary text-[10px] leading-relaxed border-t border-border-sutil pt-3">
              <span className="text-text-secondary uppercase tracking-widest">Responsável</span> saiu deste
              formulário. Entregar e devolver são operação, não campo: use o botão de entrega na linha do
              ativo. É de lá que sai o histórico de posse — e é o que permite entregar a um posto de
              trabalho, cujos ocupantes podem ser vários.
            </p>
          </Secao>

          <Secao titulo="Compra">
            <div className="space-y-1">
              <label className={ROTULO}>Fornecedor</label>
              <ReferenceSelect rota="suppliers" valor={valores.supplierId} onChange={(v) => definir('supplierId', v)} />
            </div>
            <div className="space-y-1">
              <label className={ROTULO}>Número do pedido</label>
              <input value={valores.orderNumber} onChange={(e) => definir('orderNumber', e.target.value)} className={CLASSE_CAMPO} />
            </div>
            <div className="space-y-1">
              <label className={ROTULO}>Data da compra</label>
              <input type="date" value={valores.purchaseDate} onChange={(e) => definir('purchaseDate', e.target.value)} className={CLASSE_CAMPO} />
            </div>
            <div className="space-y-1">
              <label className={ROTULO}>Valor (R$)</label>
              {/* `text`, não `number`: o valor viaja como string do formulário ao
                  Postgres, sem passar por ponto flutuante em lugar nenhum. */}
              <input inputMode="decimal" value={valores.purchaseCost} onChange={(e) => definir('purchaseCost', e.target.value)} placeholder="Ex: 4599.90" className={CLASSE_CAMPO} />
            </div>
          </Secao>

          <Secao titulo="Prazos">
            <div className="space-y-1">
              <label className={ROTULO}>Garantia (meses)</label>
              <input type="number" min={0} value={valores.warrantyMonths} onChange={(e) => definir('warrantyMonths', e.target.value)} className={CLASSE_CAMPO} />
            </div>
            <div className="space-y-1">
              <label className={ROTULO}>Vida útil (meses)</label>
              <input type="number" min={0} value={valores.eolMonths} onChange={(e) => definir('eolMonths', e.target.value)} placeholder="herda do modelo" className={CLASSE_CAMPO} />
            </div>
            <label className="flex items-center gap-3 cursor-pointer text-text-secondary col-span-2">
              <input type="checkbox" checked={valores.eolExplicit} onChange={(e) => definir('eolExplicit', e.target.checked)} className="accent-status-success w-4 h-4" />
              <span className={ROTULO}>Definir a data de fim de vida à mão</span>
            </label>
            {valores.eolExplicit && (
              <div className="space-y-1">
                <label className={ROTULO}>Fim de vida</label>
                <input type="date" value={valores.eolDate} onChange={(e) => definir('eolDate', e.target.value)} className={CLASSE_CAMPO} />
              </div>
            )}
            <p className="col-span-2 text-text-tertiary text-[10px] leading-relaxed">
              Vencimento da garantia e fim de vida são calculados a partir da data da compra.
              Sem data de compra, os dois ficam em branco.
            </p>
          </Secao>

          <Secao titulo="Outros">
            <label className="flex items-center gap-3 cursor-pointer text-text-secondary">
              <input type="checkbox" checked={valores.byod} onChange={(e) => definir('byod', e.target.checked)} className="accent-status-success w-4 h-4" />
              <span className={ROTULO}>Equipamento do colaborador (BYOD)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer text-text-secondary">
              <input type="checkbox" checked={valores.requestable} onChange={(e) => definir('requestable', e.target.checked)} className="accent-status-success w-4 h-4" />
              <span className={ROTULO}>Pode ser solicitado</span>
            </label>
            <div className="space-y-1 col-span-2">
              <label className={ROTULO}>Notas</label>
              <textarea value={valores.notes} onChange={(e) => definir('notes', e.target.value)} className={`${CLASSE_CAMPO} h-20 resize-none`} />
            </div>
          </Secao>

          <div className="pt-4 flex justify-end gap-3 border-t border-border-sutil">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50">
              {salvando ? 'Salvando...' : clonar ? 'Criar cópia' : 'Salvar Ativo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-text-tertiary uppercase tracking-widest text-[10px] border-b border-border-sutil w-full pb-2 mb-3">
        {titulo}
      </legend>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </fieldset>
  );
}

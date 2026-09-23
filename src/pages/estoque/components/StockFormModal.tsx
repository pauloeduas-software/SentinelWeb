import { useState } from 'react';
import { X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import { limpar } from '../helpers/estoque.helper';
import { paraCampoDeData } from '../../helpers/format.helper';
import type { ItemDeEstoqueInput } from '../../../domain/stock/stock.queries';
import type { AbaDeEstoque } from '../helpers/estoque.helper';
import type { ItemDeEstoque } from '../../../domain/shared/stock.types';

// Cadastro e edição de um item de estoque.
//
// ─────────────────────────────────────────────────────────────────────────────
// O CAMPO "QUANTIDADE" SÓ EXISTE NA CRIAÇÃO — e não é uma regra de tela.
//
// No `PUT`, o servidor responde 422 à chave `qty`, porque o `strictObject` do
// schema de edição não a declara (D34, pelo mesmo motivo do D17 para
// `assignedToId`). Quantidade é CONSEQUÊNCIA de movimentação: quem a muda é o
// ajuste, na mesma transação que grava o `StockLog`. Se este campo aparecesse
// ao editar, o formulário seria um segundo caminho para mudar a quantidade — e
// o único que não deixaria histórico.
//
// A frase embaixo do campo existe para o operador não procurar o campo que
// sumiu: ela aponta para onde a operação mora.
// ─────────────────────────────────────────────────────────────────────────────
//
// A CATEGORIA é filtrada pelo TIPO da aba (`filtroTipo`): o `<select>` de um
// acessório não oferece categoria de ativo, porque o servidor a recusaria com
// 422. A tela não é a regra — ela evita o erro que a regra pegaria.

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

interface StockFormModalProps {
  aba: AbaDeEstoque;
  /** Preenchido = edição. `null` = cadastro. */
  item: ItemDeEstoque | null;
  onClose: () => void;
  onSubmit: (data: ItemDeEstoqueInput) => Promise<void>;
}

export default function StockFormModal({ aba, item, onClose, onSubmit }: StockFormModalProps) {
  const editando = item !== null;

  const [name, setName] = useState(item?.name ?? '');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [qty, setQty] = useState(item ? String(item.qty) : '0');
  const [minQty, setMinQty] = useState(item?.minQty != null ? String(item.minQty) : '');
  const [modelNumber, setModelNumber] = useState(item?.modelNumber ?? '');
  const [serial, setSerial] = useState(item?.serial ?? '');
  const [manufacturerId, setManufacturerId] = useState(item?.manufacturerId ?? '');
  const [supplierId, setSupplierId] = useState(item?.supplierId ?? '');
  const [locationId, setLocationId] = useState(item?.locationId ?? '');
  const [orderNumber, setOrderNumber] = useState(item?.orderNumber ?? '');
  const [purchaseDate, setPurchaseDate] = useState(paraCampoDeData(item?.purchaseDate));
  // STRING do começo ao fim: converter para `number` aqui é como o erro de
  // centavo entra (a coluna é `Decimal`).
  const [purchaseCost, setPurchaseCost] = useState(item?.purchaseCost ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    const dados: ItemDeEstoqueInput = {
      name: name.trim(),
      categoryId,
      minQty: minQty.trim() === '' ? null : Number(minQty),
      modelNumber: limpar(modelNumber),
      manufacturerId: limpar(manufacturerId),
      supplierId: limpar(supplierId),
      locationId: limpar(locationId),
      orderNumber: limpar(orderNumber),
      purchaseDate: limpar(purchaseDate),
      purchaseCost: limpar(purchaseCost),
      notes: limpar(notes),
    };

    // `qty` SÓ na criação. Mandá-la no `PUT` responderia 422 — ver o bloco no
    // topo deste arquivo.
    if (!editando) dados.qty = Number(qty) || 0;
    if (aba.kind === 'COMPONENT') dados.serial = limpar(serial);

    try {
      await onSubmit(dados);
    } catch (falha) {
      // O apiClient já traduziu a resposta do servidor em Error.message — é
      // aqui que aparece o 409 de nome repetido e o 422 da categoria do tipo
      // errado.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  // O singular vem DECLARADO da aba, não de cortar a última letra do plural —
  // "Consumíveis" viraria "Consumívei" (ver `estoque.helper.ts`).
  const titulo = editando ? `Editar ${aba.singular}` : `Novo ${aba.singular}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">{titulo}</h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 font-mono text-xs space-y-4 overflow-y-auto max-h-[75vh]">
          {erro && (
            <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
              <label className={ROTULO}>Nome*</label>
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex: Mouse óptico USB"
                className={CLASSE_CAMPO}
              />
            </div>

            <div className="space-y-1">
              <label className={ROTULO}>Categoria*</label>
              <ReferenceSelect
                rota="categories"
                filtroTipo={aba.kind}
                valor={categoryId}
                obrigatorio
                onChange={setCategoryId}
              />
            </div>

            {editando ? (
              <div className="space-y-1">
                <label className={ROTULO}>Quantidade</label>
                <div className="p-2 border border-border-sutil/60 bg-bg-base/40 text-text-tertiary tabular-nums">
                  {item.disponivel} de {item.qty} disponíveis
                </div>
                <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                  Quantidade não se digita aqui: ela é consequência de movimentação. Use
                  <span className="text-text-secondary"> Ajustar quantidade</span>, que grava o
                  motivo no histórico de estoque.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <label className={ROTULO}>Quantidade inicial*</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={qty}
                  onChange={(event) => setQty(event.target.value)}
                  className={CLASSE_CAMPO}
                />
                <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                  A carga inicial. Depois daqui, só muda pelo ajuste.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label className={ROTULO}>Estoque mínimo</label>
              <input
                type="number"
                min={0}
                value={minQty}
                onChange={(event) => setMinQty(event.target.value)}
                placeholder="em branco = sem alerta"
                className={CLASSE_CAMPO}
              />
              <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                Abaixo disso o item entra nos alertas. Em branco, nunca alerta.
              </p>
            </div>

            <div className="space-y-1">
              <label className={ROTULO}>Número do modelo</label>
              <input
                value={modelNumber}
                onChange={(event) => setModelNumber(event.target.value)}
                className={CLASSE_CAMPO}
              />
            </div>

            {aba.kind === 'COMPONENT' && (
              <div className="space-y-1">
                <label className={ROTULO}>Número de série</label>
                <input
                  value={serial}
                  onChange={(event) => setSerial(event.target.value)}
                  className={CLASSE_CAMPO}
                />
                <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                  Do LOTE, não de cada unidade. Peça com patrimônio próprio é ativo, não componente.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label className={ROTULO}>Fabricante</label>
              <ReferenceSelect rota="manufacturers" valor={manufacturerId} onChange={setManufacturerId} />
            </div>

            <div className="space-y-1">
              <label className={ROTULO}>Fornecedor</label>
              <ReferenceSelect rota="suppliers" valor={supplierId} onChange={setSupplierId} />
            </div>

            <div className="space-y-1">
              <label className={ROTULO}>Onde o estoque fica</label>
              <ReferenceSelect rota="locations" valor={locationId} onChange={setLocationId} />
              <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                O almoxarifado, a gaveta. Não é para quem o item foi entregue.
              </p>
            </div>

            <div className="space-y-1">
              <label className={ROTULO}>Número do pedido</label>
              <input
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
                className={CLASSE_CAMPO}
              />
            </div>

            <div className="space-y-1">
              <label className={ROTULO}>Data de compra</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(event) => setPurchaseDate(event.target.value)}
                className={CLASSE_CAMPO}
              />
            </div>

            <div className="space-y-1">
              <label className={ROTULO}>Valor de compra</label>
              <input
                value={purchaseCost}
                onChange={(event) => setPurchaseCost(event.target.value)}
                placeholder="1234.50"
                className={CLASSE_CAMPO}
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className={ROTULO}>Notas</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className={`${CLASSE_CAMPO} h-20 resize-none`}
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-border-sutil">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || !name.trim() || !categoryId}
              className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import type { ItemDeEstoque, ItemDeEstoqueInput } from '../../../domain/shared/stock.types';

// Cadastro e edição de um item de estoque.
//
// O TOTAL É CAMPO DAS DUAS, como a quantidade comprada da licença (AE): no
// cadastro, ao menos 1 — o que há hoje; na edição, o que há agora — chegaram
// mais, quebraram, a recontagem deu outro número. Reduzir não passa do que está
// em uso, e o servidor responde 409 com a conta.
//
// NA EDIÇÃO, O FORMULÁRIO INTEIRO VAI AO SERVIDOR, como nas Configurações (AF).
// O preço, declarado: o formulário aberto há tempo desfaz a edição que outra
// pessoa salvou no meio. O servidor continua barrando o que quebra regra.

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

function limpar(valor: string): string | null {
  const texto = valor.trim();
  return texto === '' ? null : texto;
}

interface ItemFormModalProps {
  /** Preenchido = edição. `null` = cadastro. */
  item: ItemDeEstoque | null;
  onClose: () => void;
  /** O corpo inteiro, no cadastro e na edição. */
  onSubmit: (data: ItemDeEstoqueInput) => Promise<void>;
}

export default function ItemFormModal({ item, onClose, onSubmit }: ItemFormModalProps) {
  const editando = item !== null;

  const [name, setName] = useState(item?.name ?? '');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [locationId, setLocationId] = useState(item?.locationId ?? '');
  const [qty, setQty] = useState(item ? String(item.qty) : '1');
  const [notes, setNotes] = useState(item?.notes ?? '');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();

    // A quantidade em branco não vira 0, e zero não existe — a mesma regra da
    // quantidade comprada no `LicencaFormModal`.
    const quantidade = Number(qty);
    if (qty.trim() === '' || !Number.isInteger(quantidade) || quantidade < 1) {
      setErro(editando
        ? 'Informe a quantidade: um número inteiro, 1 ou mais.'
        : 'Informe a quantidade inicial: um número inteiro, 1 ou mais.');
      return;
    }

    setSalvando(true);
    setErro('');

    const dados: ItemDeEstoqueInput = {
      name: name.trim(),
      categoryId,
      qty: quantidade,
      locationId: locationId || null,
      notes: limpar(notes),
    };

    try {
      await onSubmit(dados);
    } catch (falha) {
      // É aqui que aparecem o 422 de categoria do tipo errado, o 409 do nome
      // repetido e o de reduzir abaixo do que está em uso.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">
            {editando ? 'Editar item' : 'Novo item'}
          </h2>
          <button onClick={onClose} aria-label="Fechar" title="Fechar" className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 font-mono text-xs space-y-4">
          {erro && (
            <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
          )}

          <label className="space-y-1.5 block">
            <span className={ROTULO}>Nome *</span>
            <input
              required value={name} onChange={(e) => setName(e.target.value)}
              className={CLASSE_CAMPO}
            />
          </label>

          <label className="space-y-1.5 block">
            <span className={ROTULO}>Categoria *</span>
            {/* Filtrada por TIPO: o `<select>` não oferece categoria de
                ativo ou de licença, porque o servidor a recusaria com 422. */}
            <ReferenceSelect rota="categories" filtroTipo="STOCK" valor={categoryId} obrigatorio atual={item?.category} onChange={setCategoryId} />
          </label>

          <label className="space-y-1.5 block">
            <span className={ROTULO}>Localização</span>
            {/* ONDE O QUE SOBRA FICA GUARDADO — o Depósito de TI. A unidade
                entregue a alguém está com quem a recebeu, não aqui. */}
            <ReferenceSelect rota="locations" valor={locationId} atual={item?.location} onChange={setLocationId} />
          </label>

          <label className="space-y-1.5 block">
            <span className={ROTULO}>{editando ? 'Quantidade *' : 'Quantidade inicial *'}</span>
            <input
              required type="number" min={1} step={1} value={qty}
              onChange={(e) => setQty(e.target.value)} className={CLASSE_CAMPO}
            />
            <span className="block text-[10px] text-text-tertiary leading-relaxed">
              {!item
                ? 'Ao menos 1: o que há hoje.'
                : item.emUso > 0
                  ? `O total, com o que está em uso. O mínimo é ${item.emUso}: é o que está com alguém.`
                  : 'O total que há agora.'}
            </span>
          </label>

          <label className="space-y-1.5 block">
            <span className={ROTULO}>Notas</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={CLASSE_CAMPO} />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-border-sutil text-text-tertiary hover:text-text-primary uppercase tracking-widest transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary uppercase tracking-widest transition-colors disabled:opacity-50">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

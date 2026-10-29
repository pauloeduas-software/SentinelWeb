import { useState } from 'react';
import { X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import { useCatalogOptionsQuery } from '../../../domain/catalog/catalog.queries';
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
//
// A CATEGORIA DECIDE PARA ONDE O ITEM VAI (AI): a de Estoque a colaborador ou
// posto, a de Componente só a computador. O `<select>` oferece as duas, e a
// linha abaixo dele diz quando a escolhida é de componente.

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
  // As categorias de componente, para a linha de aviso — a mesma consulta do
  // `<select>`, recortada pelo tipo. A desativada que o item já usa vem pelo
  // tipo dela no próprio item.
  const { data: componentes } = useCatalogOptionsQuery('categories', 'COMPONENT');
  const categoriaDeComponente = (item?.categoryId === categoryId && item.category.type === 'COMPONENT')
    || (componentes ?? []).some((categoria) => categoria.id === categoryId);
  // E as de consumível (AJ), pelo mesmo caminho.
  const { data: consumiveis } = useCatalogOptionsQuery('categories', 'CONSUMABLE');
  const categoriaDeConsumivel = (item?.categoryId === categoryId && item.category.type === 'CONSUMABLE')
    || (consumiveis ?? []).some((categoria) => categoria.id === categoryId);
  const [locationId, setLocationId] = useState(item?.locationId ?? '');
  const [qty, setQty] = useState(item ? String(item.qty) : '1');
  const [notes, setNotes] = useState(item?.notes ?? '');
  // A versão DESTA abertura (AF): o registro pode chegar mais novo enquanto o
  // formulário está aberto, e o que ele mostra continua sendo o desta leitura.
  const [versao] = useState(item?.updatedAt);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();

    // A quantidade em branco não vira 0. O cadastro começa com ao menos 1; na
    // edição o total é o que existe, e o item que acabou fica com 0 (AJ).
    const quantidade = Number(qty);
    const minimo = editando ? 0 : 1;
    if (qty.trim() === '' || !Number.isInteger(quantidade) || quantidade < minimo) {
      setErro(editando
        ? 'Informe a quantidade: um número inteiro, 0 ou mais.'
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
      ...(versao ? { updatedAt: versao } : {}),
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
            <ReferenceSelect rota="categories" filtroTipo="STOCK,COMPONENT,CONSUMABLE" valor={categoryId} obrigatorio atual={item?.category} onChange={setCategoryId} />
            {categoriaDeComponente && (
              <span className="block text-[10px] text-text-tertiary leading-relaxed">
                Categoria de componente: o item vai só para computador, e sai dele pelo Retirar.
              </span>
            )}
            {categoriaDeConsumivel && (
              <span className="block text-[10px] text-text-tertiary leading-relaxed">
                Categoria de consumível: a entrega tira do total e não volta.
              </span>
            )}
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
              required type="number" min={editando ? 0 : 1} step={1} value={qty}
              onChange={(e) => setQty(e.target.value)} className={CLASSE_CAMPO}
            />
            <span className="block text-[10px] text-text-tertiary leading-relaxed">
              {!item
                ? 'Ao menos 1: o que há hoje.'
                : item.emUso > 0
                  ? `O total, com o que está em uso. O mínimo é ${item.emUso}: é o que está com alguém.`
                  : 'O total que há agora — 0 quando acabou.'}
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

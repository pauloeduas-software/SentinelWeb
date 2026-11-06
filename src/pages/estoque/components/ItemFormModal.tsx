import { useState } from 'react';
import FormularioLateral from '../../../components/FormularioLateral';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { Campo } from '../../../components/ui/campo';
import { Input, Textarea } from '../../../components/ui/input';
import { useCatalogOptionsQuery } from '../../../queries/catalog.queries';
import type { ItemDeEstoque, ItemDeEstoqueInput } from '../../../types/stock.types';

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
// posto, a de Componente só a computador. O seletor oferece as duas, e a
// linha abaixo dele diz quando a escolhida é de componente.

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
  // seletor, recortada pelo tipo. A desativada que o item já usa vem pelo
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
    <FormularioLateral
      titulo={editando ? 'Editar item' : 'Novo item'}
      descricao={item?.name}
      onClose={onClose}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
    >
      <Campo rotulo="Nome" obrigatorio>
        <Input required value={name} onChange={(e) => setName(e.target.value)} />
      </Campo>

      {/* Filtrada por TIPO: o seletor não oferece categoria de ativo ou de
          licença, porque o servidor a recusaria com 422. */}
      <Campo
        rotulo="Categoria"
        obrigatorio
        ajuda={categoriaDeComponente
          ? 'Categoria de componente: o item vai só para computador, e sai dele pelo Retirar.'
          : categoriaDeConsumivel
            ? 'Categoria de consumível: a entrega tira do total e não volta.'
            : undefined}
      >
        <ReferenceSelect rota="categories" filtroTipo="STOCK,COMPONENT,CONSUMABLE" valor={categoryId} obrigatorio atual={item?.category} onChange={setCategoryId} />
      </Campo>

      {/* ONDE O QUE SOBRA FICA GUARDADO — o Depósito de TI. A unidade entregue a
          alguém está com quem a recebeu, não aqui. */}
      <Campo rotulo="Localização">
        <ReferenceSelect rota="locations" valor={locationId} atual={item?.location} onChange={setLocationId} />
      </Campo>

      <Campo
        rotulo={editando ? 'Quantidade' : 'Quantidade inicial'}
        obrigatorio
        ajuda={!item
          ? 'Ao menos 1: o que há hoje.'
          : item.emUso > 0
            ? `O total, com o que está em uso. O mínimo é ${item.emUso}: é o que está com alguém.`
            : 'O total que há agora: 0 quando acabou.'}
      >
        <Input
          required type="number" min={editando ? 0 : 1} step={1} value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </Campo>

      <Campo rotulo="Notas">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Campo>
    </FormularioLateral>
  );
}

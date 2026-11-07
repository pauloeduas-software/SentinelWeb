import { useState } from 'react';
import { useCheckoutStock, useDeleteStockItem, useUpdateStockItem } from '../../../queries/stock.queries';
import type { AlvoDaEntregaDeEstoque, ItemDeEstoque, ItemDeEstoqueInput } from '../../../types/stock.types';
import { confirmar } from '../../../hooks/useConfirmacao';
import { useNotificacao } from '../../../hooks/useNotificacao';
import { linksDoErro } from '../../../helpers/erro.helper';

/** Qual formulário está aberto. Um de cada vez, como nas outras telas. */
type FormularioDoItem = 'editar' | 'entregar' | null;

// O QUE SE FAZ COM UM ITEM, na linha da lista e na ficha: as mesmas regras e as
// mesmas frases nos dois lugares. É o cadastro das Configurações (`useCatalog`):
// Desativar/Ativar e Excluir com as frases de lá.
export function useAcoesDoItem({ aoExcluir }: { aoExcluir?: () => void } = {}) {
  const notificar = useNotificacao();
  const editar = useUpdateStockItem();
  const excluir = useDeleteStockItem();
  const entregar = useCheckoutStock();

  const [formulario, setFormulario] = useState<FormularioDoItem>(null);
  const [itemAberto, setItemAberto] = useState<ItemDeEstoque | null>(null);

  const abrir = (proximo: Exclude<FormularioDoItem, null>, item: ItemDeEstoque) => {
    setItemAberto(item);
    setFormulario(proximo);
  };

  const fechar = () => {
    setFormulario(null);
    setItemAberto(null);
  };

  // O formulário inteiro vai, como nas Configurações (AF). O erro sobe para ele
  // mostrar a mensagem do servidor: o 422 de categoria do tipo errado, o 409 do
  // nome repetido e o de reduzir o total abaixo do que está em uso.
  const handleEditar = async (dados: ItemDeEstoqueInput) => {
    if (!itemAberto) return;
    await editar.mutateAsync({ id: itemAberto.id, data: dados });
    fechar();
    notificar.sucesso('Item salvo.');
  };

  const handleEntregar = async (alvo: AlvoDaEntregaDeEstoque) => {
    if (!itemAberto) return;
    await entregar.mutateAsync({ itemId: itemAberto.id, alvo });
    fechar();
    notificar.sucesso('Item entregue.');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // OS CLIQUES DIRETOS — desativar, excluir — não têm campo de erro para a
  // mensagem subir, e por isso cada um tem o seu `try/catch` com notificação
  // (`useNotificacao`). Sem ele a rejeição vira *unhandled rejection* e a tela
  // não faz NADA: o 409 daqui é escrito para ensinar.
  // ─────────────────────────────────────────────────────────────────────────

  // DESATIVAR/ATIVAR, com a frase de Configurações (`useCatalog`): grava só
  // `isActive`, e confirma só na ida — ativar não tem o que perder. O botão
  // sempre clica: com unidade em uso, o 409 do servidor manda devolver antes.
  const handleAlternarAtivo = async (item: ItemDeEstoque) => {
    if (item.isActive && !(await confirmar({
      titulo: `Desativar "${item.name}"?`,
      descricao: 'Continua no histórico, mas some das escolhas e não recebe nada novo.',
      acao: 'Desativar',
    }))) return;
    try {
      await editar.mutateAsync({ id: item.id, data: { isActive: !item.isActive } });
      notificar.sucesso(item.isActive ? 'Item desativado.' : 'Item ativado.');
    } catch (erro) {
      notificar.erro((erro as Error).message);
    }
  };

  // EXCLUIR, com a frase de Configurações. O botão sempre clica: o item com
  // unidade em uso recebe o 409 do servidor, que diz com quem e manda devolver.
  const handleExcluir = async (item: ItemDeEstoque) => {
    if (!(await confirmar({
      titulo: `Excluir "${item.name}"?`,
      descricao: 'Esta ação não tem lixeira.',
      acao: 'Excluir',
      perigo: true,
    }))) return;
    try {
      await excluir.mutateAsync(item.id);
      aoExcluir?.();
      notificar.sucesso('Item excluído.');
    } catch (erro) {
      notificar.erro((erro as Error).message, linksDoErro(erro));
    }
  };

  return {
    formulario,
    itemAberto,
    abrir,
    fechar,

    // Enquanto uma ação corre, os botões dela ficam desabilitados: o duplo
    // clique dava "já foi devolvida" DEPOIS de a devolução ter dado certo.
    ocupado: excluir.isPending || editar.isPending,

    handleEditar,
    handleEntregar,
    handleAlternarAtivo,
    handleExcluir,
  };
}

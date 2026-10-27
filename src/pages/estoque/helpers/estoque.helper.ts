import type { EventoDoItem, ItemDeEstoque } from '../../../domain/shared/stock.types';
import { textoDeUnidades } from '../../helpers/estoque.helper';

// Funções puras da tela de estoque (docs/referencia/arquitetura.md). O que as
// outras telas também mostram — o link do item — mora em
// `src/pages/helpers/estoque.helper.ts`.

/** "10 no total · 7 em uso · 3 disponíveis". */
export function resumoDaContagem(item: Pick<ItemDeEstoque, 'qty' | 'emUso' | 'disponivel'>): string {
  return [
    `${item.qty} no total`,
    `${item.emUso} em uso`,
    `${item.disponivel} ${item.disponivel === 1 ? 'disponível' : 'disponíveis'}`,
  ].join(' · ');
}

/**
 * A conta não tem cor pelo valor — zero e positivo são só números. A única
 * marca é o disponível NEGATIVO, que é aviso e não dado: o servidor calcula
 * `qty − emUso` sem travar no zero (`stock-balance.helper.ts`), e um negativo é
 * a inconsistência (entrega gravada fora da trava) que a tela precisa mostrar.
 */
export function classeDaConta(item: Pick<ItemDeEstoque, 'disponivel'>): string {
  return item.disponivel < 0 ? 'text-status-danger' : 'text-text-secondary';
}

/**
 * O item é COMPONENTE (AI)? É a categoria que diz: o componente vai só para
 * computador, e sai dele pelo Retirar.
 */
export function ehComponente(item: Pick<ItemDeEstoque, 'category'>): boolean {
  return item.category.type === 'COMPONENT';
}

/** "Entregue a Mesa 1 · 5 unidades", "Instalado em ATV-00012 · 1 unidade". */
export function tituloDoEvento(evento: EventoDoItem): string {
  const unidades = textoDeUnidades(evento.unidades);
  if (evento.targetType === 'ASSET') {
    return `${evento.action === 'CHECKOUT' ? 'Instalado em' : 'Retirado de'} ${evento.targetLabel} · ${unidades}`;
  }
  return `${evento.action === 'CHECKOUT' ? 'Entregue a' : 'Devolvida por'} ${evento.targetLabel} · ${unidades}`;
}

/**
 * Por que este item não pode ser entregue agora — `null` quando pode.
 *
 * A mesma regra na tabela e no detalhe: o servidor recusa o desativado e o sem
 * unidade, e o botão não convida ao 409. O texto vai no `title` do botão.
 */
export function motivoParaNaoEntregar(item: Pick<ItemDeEstoque, 'isActive' | 'disponivel'>): string | null {
  if (!item.isActive) return 'Desativado: ative para entregar';
  if (item.disponivel <= 0) return 'Sem unidade disponível';
  return null;
}

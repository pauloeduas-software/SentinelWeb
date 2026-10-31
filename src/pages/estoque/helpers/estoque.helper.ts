import type { EventoDoItem, ItemDeEstoque } from '../../../types/stock.types';
import { textoDeUnidades } from '../../../helpers/estoque.helper';

// Funções puras da tela de estoque (docs/referencia/arquitetura.md). O que as
// outras telas também mostram — o link do item — mora em
// `src/helpers/estoque.helper.ts`.

/**
 * "10 no total · 7 em uso · 3 disponíveis". O consumível (AJ) nunca tem unidade
 * em uso, e o total dele é o disponível: só "3 disponíveis".
 */
export function resumoDaContagem(item: Pick<ItemDeEstoque, 'qty' | 'emUso' | 'disponivel' | 'category'>): string {
  const disponiveis = `${item.disponivel} ${item.disponivel === 1 ? 'disponível' : 'disponíveis'}`;
  if (ehConsumivel(item)) return disponiveis;
  return [`${item.qty} no total`, `${item.emUso} em uso`, disponiveis].join(' · ');
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

/**
 * O item é CONSUMÍVEL (AJ)? A categoria diz: a entrega tira do total e não
 * volta — não tem "Com quem está" nem Devolver.
 */
export function ehConsumivel(item: Pick<ItemDeEstoque, 'category'>): boolean {
  return item.category.type === 'CONSUMABLE';
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

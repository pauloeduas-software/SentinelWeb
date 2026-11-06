import type { Asset } from '../../../types/asset.types';
import { formatarData } from '../../../helpers/format.helper';

// BAIXA na tela — funções puras, fora do JSX
// (docs/referencia/arquitetura.md: "cálculo sai do JSX").
//
// São DUAS saídas diferentes e uma não substitui a outra (D19):
//
//   retiredAt  saiu do PATRIMÔNIO  (fato datado: vendido, roubado)
//   deletedAt  foi cadastrado ERRADO (lixeira)
//
// Este arquivo cuida da primeira, e o vocabulário da tela vem daqui para as três
// telas que a mostram (listagem, detalhe e modal) dizerem a mesma coisa.

/**
 * "Vendido em 10/09/2026" — o selo da linha e do cabeçalho do detalhe.
 *
 * `null` quando o ativo continua no patrimônio: quem chama esconde o selo em
 * vez de mostrar um traço, porque a ausência aqui é o caso NORMAL e não uma
 * informação faltando.
 */
export function seloDaSaida(asset: Pick<Asset, 'retiredAt' | 'retiredReason'>): string | null {
  if (!asset.retiredAt) return null;
  return `${asset.retiredReason?.name ?? '—'} em ${formatarData(asset.retiredAt)}`;
}

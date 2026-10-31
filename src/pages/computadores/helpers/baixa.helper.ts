import type { Asset, MotivoDaSaida } from '../../../types/asset.types';
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
 * Os motivos, em português, na ordem em que fazem sentido no `<select>`: o que
 * mais acontece primeiro.
 *
 * Os VALORES espelham o enum `RetiredReason` do banco e não podem ser
 * traduzidos — quem traduz é o rótulo.
 */
export const MOTIVOS_DA_SAIDA: readonly { value: MotivoDaSaida; label: string }[] = [
  { value: 'VENDIDO', label: 'Vendido' },
  { value: 'DESCARTADO', label: 'Descartado' },
  { value: 'DOADO', label: 'Doado' },
  { value: 'GARANTIA', label: 'Devolvido em garantia' },
  { value: 'EXTRAVIADO', label: 'Extraviado' },
  { value: 'ROUBADO', label: 'Roubado' },
];

export function rotuloDoMotivo(motivo: MotivoDaSaida | null | undefined): string {
  if (!motivo) return '—';
  return MOTIVOS_DA_SAIDA.find((opcao) => opcao.value === motivo)?.label ?? motivo;
}

/**
 * "Vendido em 10/09/2026" — o selo da linha e do cabeçalho do detalhe.
 *
 * `null` quando o ativo continua no patrimônio: quem chama esconde o selo em
 * vez de mostrar um traço, porque a ausência aqui é o caso NORMAL e não uma
 * informação faltando.
 */
export function seloDaSaida(asset: Pick<Asset, 'retiredAt' | 'retiredReason'>): string | null {
  if (!asset.retiredAt) return null;
  return `${rotuloDoMotivo(asset.retiredReason)} em ${formatarData(asset.retiredAt)}`;
}

import type { Asset, MotivoDaSaida } from '../../../domain/shared/asset.types';
import { formatarData } from '../../helpers/format.helper';

// DESCOMISSIONAMENTO na tela — funções puras, fora do JSX
// (docs/ARQUITETURA.md: "cálculo sai do JSX").
//
// São TRÊS saídas diferentes e nenhuma substitui a outra (D19):
//
//   status.type = ARCHIVED  saiu da OPERAÇÃO    (classificação, reversível)
//   retiredAt               saiu do PATRIMÔNIO  (fato datado: vendido, roubado)
//   deletedAt               foi cadastrado ERRADO (lixeira)
//
// Este arquivo cuida da do meio, e o vocabulário da tela vem daqui para as três
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

/** Saiu do patrimônio? É a pergunta que decide entre "Descomissionar" e "Reverter". */
export function estaDescomissionado(asset: Pick<Asset, 'retiredAt'> | null | undefined): boolean {
  return asset?.retiredAt != null;
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

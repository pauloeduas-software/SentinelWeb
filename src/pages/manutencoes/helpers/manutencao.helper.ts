import type { Manutencao, TipoDeManutencao } from '../../../domain/shared/lifecycle.types';
import { TIPOS_DE_MANUTENCAO } from '../../../domain/shared/lifecycle.types';

// Cálculo fora do JSX (docs/ARQUITETURA.md) — funções puras.

export function rotuloDoTipo(type: TipoDeManutencao): string {
  return TIPOS_DE_MANUTENCAO.find((opcao) => opcao.value === type)?.label ?? type;
}

/**
 * A cor da situação — e ela fala do TEMPO em aberto, não do tipo.
 *
 * Verde é encerrada; âmbar é aberta; vermelho é aberta há muito tempo. O limiar
 * de 30 dias aqui é da TELA e não o `maintenanceOpenDays` configurado de
 * propósito: a cor é uma pista visual, e buscar a configuração para pintar uma
 * célula faria a tabela depender de uma segunda consulta para renderizar.
 */
export function corDaSituacao(manutencao: Manutencao): string {
  if (!manutencao.emAberto) return '#22c55e';
  return (manutencao.diasEmAberto ?? 0) > 30 ? '#ef4444' : '#f59e0b';
}

export function textoDaSituacao(manutencao: Manutencao): string {
  if (!manutencao.emAberto) return 'Encerrada';
  const dias = manutencao.diasEmAberto ?? 0;
  if (dias === 0) return 'Aberta hoje';
  return `Aberta há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** "ATV-00012 — Dell Latitude 5420". */
export function identificacaoDoAtivo(manutencao: Manutencao): string {
  const { asset } = manutencao;
  const descricao = asset.name ?? `${asset.model.manufacturer.name} ${asset.model.name}`;
  return `${asset.assetTag} — ${descricao}`;
}

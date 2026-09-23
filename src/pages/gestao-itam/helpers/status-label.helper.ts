// Aparência do status do inventário. Fica fora do componente para a tabela e o
// formulário não divergirem quando um status novo entrar.
//
// Enquanto `InventoryItem.status` for texto livre no schema, esta lista é a
// única definição do que a interface conhece — na Fase 1 do docs/ITAM-TODO.md
// ela vira a tabela `StatusLabel` e sai daqui.

export const INVENTORY_STATUS_OPTIONS = [
  { value: 'AVAILABLE', label: 'Disponível' },
  { value: 'DEPLOYED', label: 'Em Uso (Deployed)' },
  { value: 'BROKEN', label: 'Danificado/Manutenção' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'text-status-success bg-status-success/10 border-status-success/20',
  DEPLOYED: 'text-status-info bg-status-info/10 border-status-info/20',
  BROKEN: 'text-status-danger bg-status-danger/10 border-status-danger/20',
};

const FALLBACK_COLOR = 'text-text-tertiary bg-surface-card border-border-sutil';

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? FALLBACK_COLOR;
}

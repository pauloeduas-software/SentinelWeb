// A configuração global é UMA linha, e o id fixo é o que garante isso: não há
// como criar a segunda sem repetir a chave primária.
export const APP_SETTING_ID = 'singleton';

/** `ATV-` + `00042`. O zerofill é o total de dígitos, não o de zeros. */
export function formatAssetTag(prefixo: string, zerofill: number, numero: number): string {
  return `${prefixo}${String(numero).padStart(zerofill, '0')}`;
}

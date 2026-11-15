// A LIMPEZA DOS IDENTIFICADORES DE HARDWARE — funções puras, sem I/O.
//
// Este arquivo existe porque os identificadores de hardware MENTEM de formas
// específicas e repetidas, e a mentira tem que ser reconhecida ANTES da
// comparação. Depois é tarde: dois valores iguais já casaram.
//
// O D46 em código: lixo conhecido vira `null`, e `null` não pontua.

/**
 * Seriais que a fábrica deixou em branco.
 *
 * Não são casos raros: são literalmente o texto que sai de placa-mãe genérica e
 * de máquina montada, e a MESMA string aparece em dezenas de equipamentos.
 * Casar por um deles vincularia a frota inteira ao mesmo ativo — e o pior é que
 * o sistema diria que está certo, com 100 pontos.
 */
const SERIAIS_DE_FABRICA = new Set([
  // Os do D46.
  'to be filled by o.e.m.',
  'to be filled by oem',
  'system serial number',
  'default string',
  'chassis serial number',
  'not applicable',
  'not specified',
  'none',
  'n/a',
  'na',
  'null',
  'unknown',
  'invalid',
  'o.e.m.',
  'oem',
  '0123456789',
  '123456789',
  '00000000',
  // Os que o Fleet (`IsPlaceholderHardwareSerial`, em `server/fleet/hosts.go`) e o
  // GLPI Agent (`isInvalidBiosValue`, em `lib/GLPI/Agent/Tools/Generic.pm`) já
  // reconhecem (CT).
  'default',
  'base board serial number',
  'baseboard serial number',
  'not available',
  'not present',
  '1234567890',
  '1234567',
].map(compactar));

/**
 * O serial sem separadores, só para reconhecer o lixo: `System Serial Number`,
 * `SystemSerialNumber` e `0000-0000` são o mesmo preenchimento de fábrica (CT).
 * A mesma conta que o SentinelAgente faz antes do hash do HWID.
 */
function compactar(valor: string): string {
  return valor.toLowerCase().replace(/[-:\s]/g, '');
}

/**
 * UUIDs que não identificam nada.
 *
 * O de zeros aparece em hardware barato; o `ffffffff-…` é o mesmo caso com o
 * outro extremo. UUID de TEMPLATE de VM — que se repete em toda máquina clonada
 * daquele template — não dá para listar aqui, porque ele é um uuid legítimo:
 * quem o pega é a regra da colisão (mais de um candidato = zero).
 */
const UUIDS_INUTEIS = new Set([
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '03000200-0400-0500-0006-000700080009',
  // Os dois que o osquery acrescenta (`kPlaceholderHardwareUUIDList`, em
  // `osquery/core/system.cpp`), e os de fábrica da AMI na outra ordem de bytes,
  // que o kernel usa no SMBIOS anterior ao 2.6 (`dmi_scan.c`, `dmi_save_uuid`) (CT).
  '03020100-0504-0706-0809-0a0b0c0d0e0f',
  '10000000-0000-8000-0040-000000000000',
  '00020003-0004-0005-0006-000700080009',
  '00010203-0405-0607-0809-0a0b0c0d0e0f',
]);

function limpar(valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

/**
 * Serial comparável, ou `null` quando é lixo.
 *
 * O corte por tamanho (< 4) não é arbitrário: serial de três caracteres não
 * identifica equipamento nenhum e casaria com qualquer coisa numa busca
 * insensível a caixa.
 */
export function normalizeSerial(valor: string | null | undefined): string | null {
  const limpo = limpar(valor);
  if (!limpo) return null;

  // O lixo se reconhece no valor sem separadores; o que volta é o valor como veio.
  const minusculo = limpo.toLowerCase();
  const compacto = compactar(limpo);
  if (SERIAIS_DE_FABRICA.has(compacto)) return null;
  if (compacto.length < 4) return null;
  // Só zeros, só uns, só o mesmo caractere: é preenchimento, não identidade.
  if (/^(.)\1+$/.test(compacto)) return null;

  return minusculo;
}

/** UUID de sistema comparável, ou `null`. */
export function normalizeUuid(valor: string | null | undefined): string | null {
  const limpo = limpar(valor);
  if (!limpo) return null;

  const minusculo = limpo.toLowerCase().replace(/[{}]/g, '');
  if (UUIDS_INUTEIS.has(minusculo)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(minusculo)) return null;

  return minusculo;
}

/**
 * Hostname comparável.
 *
 * O domínio sai (`PC-ANA.empresa.local` → `pc-ana`): a mesma máquina aparece com
 * e sem sufixo dependendo de como o agente leu o nome.
 */
export function normalizeHostname(valor: string | null | undefined): string | null {
  const limpo = limpar(valor);
  if (!limpo) return null;

  const semDominio = limpo.toLowerCase().split('.')[0];
  return semDominio.length >= 3 ? semDominio : null;
}

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
]);

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
]);

/**
 * MACs que não são de placa de rede física.
 *
 * `00:00:00:00:00:00` é ausência. Os prefixos são adaptadores virtuais —
 * VMware, VirtualBox, Hyper-V, Docker —, que TODA máquina com aquele software
 * tem iguais. É o mesmo problema do serial de fábrica, com outro nome.
 */
const MACS_VIRTUAIS = ['00:00:00:00:00:00', '00:50:56', '00:0c:29', '00:05:69', '08:00:27', '00:15:5d', '02:42:'];

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

  const minusculo = limpo.toLowerCase();
  if (SERIAIS_DE_FABRICA.has(minusculo)) return null;
  if (minusculo.length < 4) return null;
  // Só zeros, só uns, só o mesmo caractere: é preenchimento, não identidade.
  if (/^(.)\1+$/.test(minusculo)) return null;

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
 * MAC comparável, ou `null`.
 *
 * Aceita `00-1A-2B`, `001a2b…` e `00:1a:2b`, e devolve sempre com dois-pontos:
 * o agente já mandou os três formatos em versões diferentes, e comparar grafias
 * diferentes do mesmo endereço é não comparar nada.
 */
export function normalizeMac(valor: string | null | undefined): string | null {
  const limpo = limpar(valor);
  if (!limpo) return null;

  const so_hex = limpo.toLowerCase().replace(/[^0-9a-f]/g, '');
  if (so_hex.length !== 12) return null;

  const formatado = so_hex.match(/.{2}/g)!.join(':');
  if (MACS_VIRTUAIS.some((prefixo) => formatado.startsWith(prefixo))) return null;

  return formatado;
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

/**
 * A chave de usuário: `DOMINIO\ana.silva` → `ana.silva`, `ana@empresa.com` →
 * `ana`.
 *
 * Guardada mesmo quando não casa com ninguém — é ela que denuncia a conta de
 * serviço que precisa entrar na allowlist do `AppSetting` (D101).
 */
export function normalizeUserKey(valor: string | null | undefined): string | null {
  const limpo = limpar(valor);
  if (!limpo) return null;

  const semDominio = limpo.includes('\\') ? limpo.split('\\').pop()! : limpo;
  const semEmail = semDominio.split('@')[0];
  const minusculo = semEmail.trim().toLowerCase();

  return minusculo.length > 0 ? minusculo : null;
}

import { isIP } from 'node:net';

// A ALLOWLIST DE DESTINO DE WEBHOOK — o D126, e é função pura.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ISTO EXISTE: A URL VEM DO BANCO E A REQUISIÇÃO SAI DO SERVIDOR.
//
// Isso é SSRF pelo desenho, não por descuido. Quem consegue escrever
// `AppSetting.alertWebhookUrl` — pela tela de configuração, por um token, por um
// dump restaurado — passa a mandar o SERVIDOR fazer requisições, de dentro da
// rede, com o que a rede confia nele. Dois exemplos que não são teóricos:
//
//   http://169.254.169.254/latest/meta-data/iam/…  → credencial da nuvem
//   http://localhost:3001/api/…                    → a própria API, por dentro
//
// O primeiro transforma a caixa de texto num leitor de credencial; o segundo, o
// job num cliente que ninguém autenticou. E o corpo do POST vai junto, então o
// alerta leva a resposta para onde o atacante quiser em muitos cenários.
//
// A DEFESA É UMA ALLOWLIST, e ela é deliberadamente estreita: `https` e endereço
// público. Slack, Teams, Discord e qualquer gateway sério atendem em `https`
// público — recusar o resto não custa caso de uso nenhum.
//
// O QUE ISTO NÃO RESOLVE, escrito para ninguém achar que resolve: um NOME que
// resolve para endereço interno (*DNS rebinding*). Por isso a checagem acontece
// em DOIS lugares — aqui, na forma da URL, e no `webhook.ts`, sobre o endereço
// que o DNS devolveu antes de conectar.
// ═════════════════════════════════════════════════════════════════════════════

export interface DestinoRecusado {
  ok: false;
  motivo: string;
}

export interface DestinoAceito {
  ok: true;
  url: URL;
}

export type Destino = DestinoAceito | DestinoRecusado;

/** Sufixos de nome que só existem dentro de uma rede. */
const SUFIXOS_INTERNOS = ['.internal', '.local', '.localdomain', '.home.arpa', '.lan'];

const NOMES_INTERNOS = new Set(['localhost', 'metadata', 'metadata.google.internal']);

/**
 * Endereço que NÃO pode ser destino: laço local, link-local, privado, CGNAT,
 * multicast e os intervalos de documentação/teste.
 *
 * `169.254.0.0/16` é o mais importante da lista e o menos óbvio: é onde AWS, GCP
 * e Azure servem metadados de instância, sem autenticação nenhuma, para quem
 * estiver na máquina.
 */
export function enderecoInterno(endereco: string): boolean {
  const versao = isIP(endereco);
  if (versao === 4) return ipv4Interno(endereco);
  if (versao === 6) return ipv6Interno(endereco);
  // Não é IP: quem decide é a checagem de nome.
  return false;
}

function ipv4Interno(endereco: string): boolean {
  const [a, b] = endereco.split('.').map(Number);

  if (a === 0 || a === 127) return true;                    // este host, laço local
  if (a === 10) return true;                                // privado
  if (a === 172 && b >= 16 && b <= 31) return true;          // privado
  if (a === 192 && b === 168) return true;                   // privado
  if (a === 169 && b === 254) return true;                   // LINK-LOCAL: metadados de nuvem
  if (a === 100 && b >= 64 && b <= 127) return true;         // CGNAT
  if (a === 192 && b === 0) return true;                     // 192.0.0.0/24 e 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return true;      // benchmark
  if (a >= 224) return true;                                 // multicast e reservado
  return false;
}

function ipv6Interno(endereco: string): boolean {
  const normalizado = endereco.toLowerCase().replace(/^\[|\]$/g, '');

  if (normalizado === '::1' || normalizado === '::') return true;

  // IPv4 mapeado (`::ffff:169.254.169.254`) é o desvio mais barato da checagem
  // de IPv4 acima, e por isso ele é desembrulhado em vez de recusado em bloco.
  const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalizado);
  if (mapeado) return ipv4Interno(mapeado[1]);

  const primeiro = normalizado.split(':')[0];
  // fc00::/7 — único local; fe80::/10 — link-local.
  if (/^f[cd]/.test(primeiro)) return true;
  if (/^fe[89ab]/.test(primeiro)) return true;
  return false;
}

function nomeInterno(host: string): boolean {
  const nome = host.toLowerCase();
  if (NOMES_INTERNOS.has(nome)) return true;
  if (SUFIXOS_INTERNOS.some((sufixo) => nome.endsWith(sufixo))) return true;
  // Nome sem ponto é sempre da rede interna: `intranet`, `gitlab`, `srv01`.
  return !nome.includes('.');
}

/**
 * A URL configurada serve como destino de webhook?
 *
 * Devolve o motivo em vez de um booleano porque ele vai para a TELA: "só https é
 * aceito" ensina; "URL inválida" faz a pessoa tentar de novo igual.
 */
export function validarDestinoDeWebhook(bruta: string): Destino {
  let url: URL;
  try {
    url = new URL(bruta.trim());
  } catch {
    return { ok: false, motivo: 'endereço inválido: use uma URL completa (https://…)' };
  }

  // `https` e nada mais. `http` vazaria o conteúdo do alerta em trânsito, e
  // `file:`/`gopher:` são os esquemas clássicos de escalada de SSRF.
  if (url.protocol !== 'https:') {
    return { ok: false, motivo: 'somente https é aceito no webhook de alertas' };
  }

  if (url.username || url.password) {
    return { ok: false, motivo: 'o endereço não pode carregar usuário e senha' };
  }

  const host = url.hostname;

  if (enderecoInterno(host)) {
    return { ok: false, motivo: `endereço interno não é aceito como destino (${host})` };
  }

  if (isIP(host) === 0 && nomeInterno(host)) {
    return { ok: false, motivo: `nome interno não é aceito como destino (${host})` };
  }

  return { ok: true, url };
}

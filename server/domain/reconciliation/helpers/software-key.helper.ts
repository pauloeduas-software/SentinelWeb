import { createHash } from 'crypto';

// O `installedSoftware` DEIXA DE SER JSON WRITE-ONLY — função pura.
//
// Até a F7 esse campo era gravado no handshake e NUNCA lido por nada: três
// ocorrências no código inteiro, todas de escrita. Aqui ele vira lista
// normalizada, e é essa lista que alimenta a conformidade de licença.

export interface PacoteNormalizado {
  name: string;
  version: string;
  publisher: string | null;
  /**
   * A CHAVE DERIVADA — o D100.
   *
   * `@@unique([name, version, publisher])` não serve: em Postgres dois `NULL`
   * não são iguais dentro de um índice único, então a tupla com `publisher`
   * nulo — que é comum, porque muito instalador não declara fabricante — NÃO
   * deduplica. O catálogo ganharia uma linha nova por máquina, por handshake, e
   * a conformidade contaria como instalações diferentes o que é a mesma.
   */
  normalizedKey: string;
}

/** `nome|versão|fabricante ?? ''`, tudo em minúsculas e sem espaço nas pontas. */
export function chaveDoPacote(name: string, version: string, publisher: string | null): string {
  return [name, version, publisher ?? ''].map((parte) => parte.trim().toLowerCase()).join('|');
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

function campo(item: Record<string, unknown>, ...nomes: string[]): string | null {
  for (const nome of nomes) {
    const pascal = nome.charAt(0).toUpperCase() + nome.slice(1);
    const achado = texto(item[pascal]) ?? texto(item[nome]);
    if (achado) return achado;
  }
  return null;
}

/**
 * Lê o que veio do agente, seja lá como ele mandou.
 *
 * TOLERANTE DE PROPÓSITO: este campo existe desde a F0, nunca teve contrato
 * escrito (ninguém o lia) e já foi mandado em pelo menos duas formas — lista de
 * objetos `{Name, Version, Publisher}` e lista de strings soltas. Recusar o que
 * não casa com um formato só apagaria do inventário justamente as máquinas com
 * agente antigo, que são as que mais precisam aparecer.
 *
 * Versão ausente vira `'-'` em vez de string vazia: o `normalizedKey` precisa de
 * três partes para não confundir "Chrome (sem versão)" com "Chrome|" de um
 * publisher vazio, e uma versão vazia no meio da chave faria as duas colidirem.
 */
export function normalizarListaDeSoftware(bruto: unknown): PacoteNormalizado[] {
  if (!Array.isArray(bruto)) return [];

  const porChave = new Map<string, PacoteNormalizado>();

  for (const item of bruto) {
    let name: string | null = null;
    let version: string | null = null;
    let publisher: string | null = null;

    if (typeof item === 'string') {
      name = texto(item);
    } else if (item && typeof item === 'object') {
      const objeto = item as Record<string, unknown>;
      name = campo(objeto, 'name', 'displayName');
      version = campo(objeto, 'version', 'displayVersion');
      publisher = campo(objeto, 'publisher', 'vendor');
    }

    if (!name) continue;

    const pacote: PacoteNormalizado = {
      name,
      version: version ?? '-',
      publisher,
      normalizedKey: chaveDoPacote(name, version ?? '-', publisher),
    };

    // A própria lista do agente vem com repetição (64 e 32 bits registrados
    // duas vezes, entradas de atualização): deduplicar aqui evita que o upsert
    // tente inserir a mesma chave duas vezes na mesma transação.
    porChave.set(pacote.normalizedKey, pacote);
  }

  return [...porChave.values()];
}

/**
 * O HASH DA LISTA — a guarda que impede o banco de apanhar.
 *
 * Sem ele, cada handshake compararia ~800 linhas de software contra o banco,
 * para 500 máquinas. Com ele, a comparação é de uma string: igual ao anterior,
 * a normalização nem começa.
 *
 * CALCULADO NO SERVIDOR, e nunca aceito do agente (D100): agente velho não manda
 * hash nenhum, e um hash errado vindo do agente (cache, coleta parcial) faria a
 * normalização NUNCA MAIS rodar para aquela máquina — o inventário de software
 * dela congelaria em silêncio, que é a pior forma de errar.
 *
 * Ordenado antes de somar: a mesma lista em ordem diferente é a mesma lista.
 */
export function hashDaListaDeSoftware(pacotes: PacoteNormalizado[]): string | null {
  if (pacotes.length === 0) return null;

  const chaves = pacotes.map((pacote) => pacote.normalizedKey).sort();
  return createHash('sha256').update(chaves.join('\n')).digest('hex');
}

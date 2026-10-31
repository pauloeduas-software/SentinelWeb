import type { FabricanteRef } from '../../../../types/asset.types';

// OS CANAIS DE SUPORTE DO FABRICANTE, prontos para a ficha do ativo.
//
// A pergunta que a ficha responde aqui é "para onde ligo para acionar a garantia
// DESTE notebook?". O cadastro dos canais mora em Configurações › Fabricantes;
// a resposta precisa estar onde a pergunta é feita — na ficha do equipamento.

/** Um canal pronto para virar link: o rótulo, o texto visível e o destino. */
export interface CanalDeSuporte {
  rotulo: string;
  texto: string;
  /** `null` quando o valor não pode virar link com segurança: sai como texto. */
  href: string | null;
  /** Abre em outra aba? Só os endereços web — `mailto:` e `tel:` abrem o app. */
  externo: boolean;
}

/**
 * Só `http`/`https` viram link.
 *
 * O servidor já recusa outro esquema no cadastro, e a checagem se repete aqui
 * mesmo assim: um `href` é executável — `javascript:` num `<a>` roda no clique —,
 * e um valor gravado antes da regra existir não passou por ela. O que não casa
 * aparece como texto, que é inofensivo e ainda legível.
 */
function enderecoWeb(valor: string): string | null {
  return /^https?:\/\//i.test(valor) ? valor : null;
}

/**
 * O telefone como o `tel:` quer: dígitos e o `+` do DDI. O texto visível
 * continua o que foi cadastrado — "0800 970 3355" se lê melhor que "08009703355".
 */
function destinoDoTelefone(valor: string): string | null {
  const discavel = valor.replace(/[^\d+]/g, '');
  return discavel ? `tel:${discavel}` : null;
}

/**
 * Os canais PREENCHIDOS, na ordem em que se usam para abrir chamado: o site
 * primeiro (o cadastro pede a página de suporte nele), depois telefone e
 * e-mail.
 *
 * Campo nulo NÃO entra: uma linha "Telefone: —" para cada canal que o fabricante
 * não tem enche a ficha de vazio. Lista vazia é a ficha não mostrar a seção.
 */
export function canaisDeSuporte(fabricante: FabricanteRef): CanalDeSuporte[] {
  const canais: CanalDeSuporte[] = [];

  // `?.trim()` porque a ficha pode receber o fabricante de um servidor que
  // ainda não manda os canais — aí os campos chegam `undefined`, não `null`.
  const site = fabricante.url?.trim();
  const telefone = fabricante.supportPhone?.trim();
  const email = fabricante.supportEmail?.trim();

  if (site) canais.push({ rotulo: 'Site', texto: site, href: enderecoWeb(site), externo: true });
  if (telefone) canais.push({ rotulo: 'Telefone', texto: telefone, href: destinoDoTelefone(telefone), externo: false });
  if (email) canais.push({ rotulo: 'E-mail', texto: email, href: `mailto:${email}`, externo: false });

  return canais;
}

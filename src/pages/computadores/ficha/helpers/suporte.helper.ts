import type { FabricanteRef } from '../../../../types/asset.types';

// OS CANAIS DE SUPORTE DO FABRICANTE, prontos para a ficha do ativo.
//
// A pergunta que a ficha responde aqui é "para onde ligo para acionar a garantia
// DESTE notebook?". O cadastro dos canais mora em Configurações › Fabricantes;
// a resposta precisa estar onde a pergunta é feita — na ficha do equipamento.

/** Um canal pronto para a ficha: o rótulo, o texto visível e o destino. */
export interface CanalDeSuporte {
  rotulo: string;
  texto: string;
  /** Só o site tem destino, e só o que pode virar link com segurança. */
  href: string | null;
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
 * Os canais PREENCHIDOS, na ordem em que se usam para abrir chamado: o site
 * primeiro (o cadastro pede a página de suporte nele), depois telefone e
 * e-mail.
 *
 * Campo nulo NÃO entra: uma linha "Telefone de suporte: —" para cada canal que o
 * fabricante não tem enche a ficha de vazio. O rótulo leva "de suporte" porque, no
 * card, sem título de seção, "Telefone" pareceria ser do computador.
 */
export function canaisDeSuporte(fabricante: FabricanteRef): CanalDeSuporte[] {
  const canais: CanalDeSuporte[] = [];

  // `?.trim()` porque a ficha pode receber o fabricante de um servidor que
  // ainda não manda os canais — aí os campos chegam `undefined`, não `null`.
  const site = fabricante.url?.trim();
  const telefone = fabricante.supportPhone?.trim();
  const email = fabricante.supportEmail?.trim();

  if (site) canais.push({ rotulo: 'Site de suporte', texto: site, href: enderecoWeb(site) });
  if (telefone) canais.push({ rotulo: 'Telefone de suporte', texto: telefone, href: null });
  if (email) canais.push({ rotulo: 'E-mail de suporte', texto: email, href: null });

  return canais;
}

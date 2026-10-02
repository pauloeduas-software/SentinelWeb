// AS DUAS FUNÇÕES PURAS DO AVATAR DE INICIAIS (F11).
//
// Moram aqui, e não dentro de `components/Iniciais.tsx`, por uma regra do
// ambiente: um arquivo que exporta componente E função perde o fast refresh do
// Vite (`react-refresh/only-export-components`) — editar a função recarregaria a
// página inteira em vez de trocar o componente no lugar.
//
// O ganho é maior do que a regra: elas são testáveis sem React e são lidas por
// quem quer saber COMO a inicial é escolhida, sem abrir markup nenhum.

/**
 * Duas letras: a inicial do primeiro nome e a do ÚLTIMO.
 *
 * "Maria da Silva Souza" vira `MS`, não `MD`: as partículas (`da`, `de`, `dos`)
 * são descartadas porque uma inicial de preposição não identifica ninguém. Nome
 * de uma palavra só usa a primeira letra — `M`, e não `MM`, que inventaria uma
 * simetria que não existe.
 */
export function iniciaisDe(nome: string): string {
  const PARTICULAS = new Set(['da', 'de', 'di', 'do', 'das', 'dos', 'e']);

  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((parte) => parte.length > 0 && !PARTICULAS.has(parte.toLowerCase()));

  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0][0].toUpperCase();

  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * O matiz, derivado do nome inteiro.
 *
 * Soma de códigos de caractere e não um hash criptográfico: a função precisa ser
 * estável e barata, não imprevisível. O pior caso de uma colisão é duas pessoas
 * com a mesma cor numa lista onde os dois nomes estão escritos.
 */
export function matizDe(nome: string): number {
  let soma = 0;
  for (let i = 0; i < nome.length; i += 1) soma = (soma + nome.charCodeAt(i) * (i + 1)) % 360;
  return soma;
}

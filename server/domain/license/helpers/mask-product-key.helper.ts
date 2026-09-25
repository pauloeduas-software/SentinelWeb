// A MÁSCARA DA CHAVE DE PRODUTO — função pura, sem I/O.
//
// O que ela existe para permitir: conferir "é esta a chave que está no
// contrato?" sem revelar a chave. Os últimos caracteres bastam para isso e não
// bastam para usar a licença — é a mesma ideia dos quatro dígitos finais de um
// cartão.
//
// ─────────────────────────────────────────────────────────────────────────────
// A MÁSCARA NÃO É COLUNA, e é de propósito.
//
// Guardá-la ao lado da chave cifrada seria barato e legível, e criaria um
// segundo lugar dizendo o mesmo fato — que é o que o D16 recusa. Duas colunas
// escritas juntas divergem no dia em que alguém escrever só uma (uma correção
// no psql, o importador de CSV da F10), e a máscara passaria a mentir sobre uma
// chave que ninguém consegue conferir sem revelar.
//
// Ela é derivada na LEITURA DE DETALHE e só ali: a listagem carrega
// `hasProductKey` e nada mais. Decifrar N linhas para pintar uma tabela poria o
// texto em claro de N chaves na memória do processo para mostrar quatro
// caracteres de cada — exposição que não paga o que entrega.
// ─────────────────────────────────────────────────────────────────────────────

/** Quantos caracteres do fim continuam visíveis. */
const VISIVEIS = 4;
const OCULTO = '•';

/**
 * `AAAA-BBBB-CCCC-AB12` → `••••-••••-••••-AB12`.
 *
 * A PONTUAÇÃO É PRESERVADA (hífen, espaço) porque é ela que torna a máscara
 * reconhecível: `••••••••••••••••AB12` não deixa ninguém dizer se a chave tem o
 * formato da Microsoft ou o da Adobe, e esse reconhecimento é metade do que a
 * máscara existe para dar.
 *
 * Chave curta demais para esconder alguma coisa — 4 caracteres ou menos — sai
 * INTEIRAMENTE mascarada. Mostrar "AB12" de uma chave que é "AB12" seria
 * revelar o segredo com aparência de máscara, que é pior do que não mascarar:
 * quem lê a tela acredita que não está vendo.
 */
export function mascararChave(chave: string): string {
  const semPontuacao = chave.replace(/[^0-9a-zA-Z]/g, '');
  const aRevelar = semPontuacao.length > VISIVEIS ? VISIVEIS : 0;
  const aOcultar = semPontuacao.length - aRevelar;

  let restamOcultos = aOcultar;
  let saida = '';
  for (const caractere of chave) {
    if (!/[0-9a-zA-Z]/.test(caractere)) {
      saida += caractere;
      continue;
    }
    saida += restamOcultos > 0 ? OCULTO : caractere;
    restamOcultos -= 1;
  }
  return saida;
}

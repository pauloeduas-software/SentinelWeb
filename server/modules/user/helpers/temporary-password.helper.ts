import { randomInt } from 'node:crypto';

// A SENHA TEMPORÁRIA (AR): gerada pelo servidor, mostrada UMA vez ao administrador
// e trocada pela própria pessoa no primeiro acesso.
//
// Sem 0/O, 1/l/I: ela é lida numa tela e digitada por outra pessoa, e o par que
// se confunde é o que gera o chamado "a senha não funciona". 16 símbolos de um
// alfabeto de 31 são ~79 bits — o `randomInt` é do crypto, não do `Math.random`.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
const TAMANHO = 16;
const GRUPO = 4;

export function gerarSenhaTemporaria(): string {
  const simbolos = Array.from({ length: TAMANHO }, () => ALFABETO[randomInt(ALFABETO.length)]);
  // Em grupos de quatro, separados por hífen: lê-se e digita-se melhor.
  const grupos: string[] = [];
  for (let i = 0; i < simbolos.length; i += GRUPO) grupos.push(simbolos.slice(i, i + GRUPO).join(''));
  return grupos.join('-');
}

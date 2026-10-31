import { randomBytes } from 'crypto';
import { argon2id, hash, needsRehash, verify } from 'argon2';

// Senha humana: argon2id, com os parâmetros padrão da biblioteca
// (m=64 MiB, t=3, p=4) — ~50 ms por verificação nesta máquina.
//
// A LENTIDÃO É O RECURSO. Um vazamento do banco dá ao atacante o hash e todo o
// tempo do mundo: contra sha256 ele testa bilhões de senhas por segundo, contra
// argon2id com 64 MiB de memória por tentativa ele testa dezenas. É por isso que
// token de máquina NÃO usa argon2 (F3, Etapa G): 32 bytes aleatórios não têm
// dicionário para atacar, e pagar 50 ms por handshake de agente seria transformar
// a defesa da senha em lentidão da frota.
//
// argon2id, e não argon2i nem argon2d: é o híbrido recomendado pela RFC 9106 —
// resiste tanto a ataque de canal lateral quanto a GPU.

export function hashSenha(senha: string): Promise<string> {
  return hash(senha, { type: argon2id });
}

export function conferirSenha(digest: string, senha: string): Promise<boolean> {
  // `verify` devolve false para hash em formato inválido em vez de lançar, o que
  // é o que queremos: um `passwordHash` corrompido é senha errada, não 500.
  return verify(digest, senha).catch(() => false);
}

/**
 * Este hash foi gerado com parâmetros mais fracos do que os de hoje?
 *
 * O custo do argon2 sobe com o hardware: o que levava 50 ms em 2026 leva menos
 * daqui a alguns anos, e aumentar os parâmetros no `hashSenha` só protege quem
 * cadastrar senha DEPOIS da mudança. Quem já tem conta ficaria para sempre com
 * a defesa antiga — e é justamente a conta antiga que interessa a um atacante.
 *
 * A saída é regravar no LOGIN, o único momento em que a senha em texto existe
 * na memória legitimamente. Quem chama é o `login.usecase.ts`, depois de a
 * senha conferir, e o usuário não percebe nada.
 *
 * SEM OPÇÕES na chamada, e é o certo: `needsRehash` compara o digest contra os
 * PADRÕES da biblioteca (m=64 MiB, t=3, p=4, v=0x13), que é exatamente o que o
 * `hashSenha` acima usa — ele só especifica o `type`. Passar parâmetros aqui
 * criaria uma segunda fonte da verdade, livre para divergir do `hashSenha` no
 * primeiro ajuste, e o sintoma seria silencioso: rehash em todo login (custo
 * dobrado) ou rehash nenhum (a proteção deixa de existir). O dia em que o
 * `hashSenha` fixar parâmetros próprios, os dois passam a sair de uma constante
 * compartilhada.
 *
 * O que esta função NÃO detecta: mudança de VARIANTE (argon2id → argon2i, por
 * exemplo). A biblioteca compara só versão, memória, tempo e paralelismo — a
 * troca de variante não aparece. Não é problema hoje, porque `argon2id` é a
 * escolha definitiva (RFC 9106) e não há plano de mexer nela.
 *
 * Tolerante por construção: hash em formato que a biblioteca não entende
 * devolve `false` em vez de estourar — um `passwordHash` corrompido já é tratado
 * como senha errada no `conferirSenha`, e não pode virar 500 aqui.
 */
export function precisaRehash(digest: string): boolean {
  try {
    return needsRehash(digest);
  } catch {
    return false;
  }
}

/**
 * Um hash contra o qual verificar quando o usuário NÃO existe.
 *
 * Enumeração de usuário vaza pelo tempo, não pela mensagem: se o caminho do
 * usuário inexistente responde sem calcular hash nenhum, ele volta em 1 ms e o
 * do usuário real em 50 ms — e essa diferença entrega a lista de quem trabalha
 * aqui, com a mensagem genérica intacta.
 *
 * O segredo é aleatório a cada boot e nunca sai daqui: não é uma senha, é um
 * relógio. Calculado na primeira chamada (e não no import) para o boot não pagar
 * 50 ms por uma coisa que só importa quando alguém erra o usuário.
 */
let referencia: Promise<string> | null = null;

export function conferirSenhaInexistente(senha: string): Promise<boolean> {
  referencia ??= hashSenha(randomBytes(32).toString('hex'));
  return referencia.then((digest) => conferirSenha(digest, senha));
}

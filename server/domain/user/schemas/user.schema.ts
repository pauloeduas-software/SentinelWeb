import { z } from 'zod';
import { textoOpcional, uuidOpcional } from '../../shared/fields.schema';

// Contrato de entrada das rotas de usuário. `strictObject` pelo mesmo motivo do
// inventário: campo desconhecido vira 422, não gravação silenciosa.
const nome = z.string('nome é obrigatório').trim()
  .min(1, 'nome não pode ser vazio')
  .max(200, 'nome: máximo de 200 caracteres');

// `toLowerCase` normaliza antes de gravar: `User.email` é `@unique` no Prisma e
// o Postgres compara texto com diferença de maiúscula — sem isto, "Ana@x.com" e
// "ana@x.com" convivem como dois cadastros.
//
// A ordem aqui é `pipe`, não encadeamento, e o motivo é uma pegadinha da zod 4:
// `z.email()` é um schema de FORMATO de topo, então `z.email().trim()` valida o
// texto ANTES de limpar — e " ana@x.com " com espaço colado do formulário era
// recusado como inválido. Com `pipe`, a limpeza acontece primeiro e o formato
// valida o que já está normalizado. (`z.string().trim().min()` não sofre disso:
// ali `.trim()` é um check do próprio string e a sequência é respeitada.)
const email = z.string('e-mail é obrigatório').trim().toLowerCase()
  .pipe(z.email('e-mail inválido').max(320, 'e-mail: máximo de 320 caracteres'));

const departamento = z.string().trim().max(120, 'departamento: máximo de 120 caracteres').nullish()
  .transform(valor => (valor === undefined ? undefined : valor || null));

export const createUserSchema = z.strictObject({
  name: nome,
  email,
  department: departamento,
});

export const updateUserSchema = z.strictObject({
  name: nome.optional(),
  email: email.optional(),
  department: departamento,
});

/**
 * DESLIGAMENTO (D32) — corpo mínimo de propósito.
 *
 * `strictObject` aqui fecha uma porta específica: `terminatedAt` e `isActive`
 * NÃO estão no schema, então não há como escolher a data da saída nem "desligar
 * sem desligar" pelo corpo. Quem carimba as duas é o use-case, com o mesmo
 * relógio que fecha as posses e as ocupações — três instantes diferentes para
 * um evento só tornariam o histórico impossível de ler em ordem.
 *
 * O que a operação faz NÃO é parametrizável: ela sempre devolve todos os ativos
 * diretos e sempre encerra todas as ocupações. Um `encerrarOcupacoes: false`
 * seria a opção de fazer pela metade exatamente o que o D32 existe para impedir.
 */
export const offboardUserSchema = z.strictObject({
  // Mesmo teto de `checkoutNotes`/`checkinNotes`, e o mesmo construtor: é o
  // texto que vai para a devolução de cada ativo, e dois tetos diferentes para
  // o mesmo campo seriam um 422 que depende de por qual rota a frase entrou.
  notes: textoOpcional('observações', 2_000),

  // Para onde os ativos voltam. Em branco, o primeiro status de estoque — o
  // caminho normal. Escolher é para o caso de o equipamento voltar para
  // conferência ou conserto.
  statusId: uuidOpcional('status'),
});

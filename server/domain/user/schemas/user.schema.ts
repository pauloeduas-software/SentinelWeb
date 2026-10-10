import { z } from 'zod';
import { dataOpcional, textoOpcional } from '../../shared/fields.schema';

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

// ─────────────────────────────────────────────────────────────────────────────
// O DEPARTAMENTO AGORA É UM ID (F11, Etapa D — D75).
//
// `department: string` SAIU do contrato de entrada, e `strictObject` faz disso
// um 422 explícito: quem ainda mandar o texto recebe "campo desconhecido:
// department" em vez de uma gravação silenciosamente ignorada. É o jeito mais
// barato de descobrir um cliente antigo.
// ─────────────────────────────────────────────────────────────────────────────
const camposDeIdentidade = {
  // QUEM COBRA a pessoa. Nunca quem responde pelo ativo dela (D72).
  employeeNumber: textoOpcional('matrícula', 40),
  jobTitle: textoOpcional('cargo', 120),
  phone: textoOpcional('telefone', 40),
  address: textoOpcional('endereço', 300),
  hiredAt: dataOpcional('data de admissão'),
};

/**
 * O PAPEL (D148), no mesmo corpo do cadastro — e não em rota própria.
 *
 * A matriz antiga tinha rota separada (`PUT /api/users/:id/groups`) porque o dono
 * do dado era o grupo: quem decidia o que uma permissão concedia era o domínio de
 * acesso, e `user` não tinha o que opinar. Com papel o dono é a COLUNA, e uma
 * rota própria para gravar um enum de três valores seria cerimônia.
 *
 * `PUT /api/users/:id` exige `ADMIN` no mapa de rotas, que é a mesma exigência
 * que a rota de grupos tinha — ninguém se promove sozinho.
 */
const papel = z.enum(['USUARIO', 'TECNICO', 'ADMIN'], 'papel inválido');

export const createUserSchema = z.strictObject({
  name: nome,
  email,
  // Ausente nasce `USUARIO`, pelo `@default` do schema: conta nova não alcança
  // nada além de si mesma, que é a porta fechada por padrão da F3.
  role: papel.optional(),
  ...camposDeIdentidade,
});

export const updateUserSchema = z.strictObject({
  name: nome.optional(),
  email: email.optional(),
  role: papel.optional(),
  ...camposDeIdentidade,
});

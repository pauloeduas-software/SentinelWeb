import { z } from 'zod';
import { booleano } from '../../shared/fields.schema';
import { CARGOS } from '../../access/helpers/cargo';

// Contrato de entrada das rotas de usuário. `strictObject` pelo mesmo motivo do
// inventário: campo desconhecido vira 422, não gravação silenciosa.
const nome = z.string('nome é obrigatório').trim()
  .min(1, 'nome não pode ser vazio')
  .max(200, 'nome: máximo de 200 caracteres');

// `toLowerCase` normaliza antes de gravar: o e-mail é único entre os vivos e é
// o LOGIN de quem entra no sistema, e o Postgres compara texto com diferença de
// maiúscula — sem isto, "Ana@x.com" e "ana@x.com" convivem como dois cadastros,
// e quem digitasse a outra forma não entraria.
//
// A ordem aqui é `pipe`, não encadeamento, e o motivo é uma pegadinha da zod 4:
// `z.email()` é um schema de FORMATO de topo, então `z.email().trim()` valida o
// texto ANTES de limpar — e " ana@x.com " com espaço colado do formulário era
// recusado como inválido. Com `pipe`, a limpeza acontece primeiro e o formato
// valida o que já está normalizado. (`z.string().trim().min()` não sofre disso:
// ali `.trim()` é um check do próprio string e a sequência é respeitada.)
const email = z.string('e-mail é obrigatório').trim().toLowerCase()
  .pipe(z.email('e-mail inválido').max(320, 'e-mail: máximo de 320 caracteres'));

/**
 * O CARGO (D148), no mesmo corpo do cadastro — e não em rota própria.
 * Hoje um só, Administrador (Z): a separação de cargos é decisão a tomar, e a
 * tela deixou de mandar o campo. Quem só recebe equipamento não é usuário — é
 * colaborador (`catalog/specs/person.spec.ts`).
 *
 * A matriz antiga tinha rota separada (`PUT /api/users/:id/groups`) porque o dono
 * do dado era o grupo: quem decidia o que uma permissão concedia era o domínio de
 * acesso, e `user` não tinha o que opinar. Com cargo o dono é a COLUNA, e uma
 * rota própria para gravar um enum seria cerimônia.
 *
 * `PUT /api/users/:id` exige `ADMIN` no mapa de rotas, que é a mesma exigência
 * que a rota de grupos tinha — ninguém se promove sozinho.
 */
const cargo = z.enum(CARGOS, 'cargo inválido');

export const createUserSchema = z.strictObject({
  name: nome,
  email,
  // Ausente nasce `ADMIN`, pelo `@default` do schema.
  role: cargo.optional(),
  // SEM senha: o servidor gera uma temporária e a pessoa escolhe a dela no
  // primeiro acesso (AU). O administrador nunca sabe a senha que fica.
});

/**
 * Minha conta (AR): a pessoa edita o próprio NOME. O e-mail é o login e o cargo é
 * dado de administrador — os dois seguem em Usuários.
 */
export const updateOwnProfileSchema = z.strictObject({ name: nome });

/**
 * SÓ NA EDIÇÃO: quem acabou de ser cadastrado nasce ativo pelo `@default` da
 * coluna, e um `isActive: false` na criação seria cadastrar alguém já desativado
 * — operação que não existe.
 *
 * Desativar é o que tira a pessoa do sistema: o login a recusa com 403, e a
 * releitura de sessão (`current-user.usecase.ts`) derruba a sessão aberta na
 * requisição seguinte. Não é exclusão: a conta fica na lista e volta com Ativar.
 */
export const updateUserSchema = z.strictObject({
  name: nome.optional(),
  email: email.optional(),
  role: cargo.optional(),
  isActive: booleano('ativo').optional(),
  // Sem senha (AU): a de outra pessoa é a temporária, em rota própria; a sua é em
  // Minha conta, com a atual.
});

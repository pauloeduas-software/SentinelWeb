import { z } from 'zod';

// Contrato de entrada do login e da troca da própria senha. `strictObject` pelo mesmo motivo do resto do sistema: campo
// desconhecido vira 422 em vez de ser ignorado em silêncio — e aqui "ignorado em
// silêncio" seria um `{"email":"a@b.c","password":"x","isAdmin":true}` passando
// batido.

// NADA de `trim` na senha: espaço no começo ou no fim é caractere como
// qualquer outro, e limpá-lo em silêncio faria a senha gravada ser diferente da
// senha digitada — um erro que só aparece no login seguinte.
//
// Mínimo de 12 e não de 8: o teto de tentativas defende contra ataque ONLINE;
// o comprimento é a única defesa contra força bruta offline num vazamento do
// banco. Teto de 128 porque argon2 aceita entrada grande e um corpo de 1 MB
// viraria negação de serviço de uma requisição só.
//
// Só a troca da própria senha a usa: o cadastro e a edição de usuário não
// recebem senha (AU).
export const senhaNova = z.string('senha é obrigatória')
  .min(12, 'senha: mínimo de 12 caracteres')
  .max(128, 'senha: máximo de 128 caracteres');

/**
 * A troca da PRÓPRIA senha (AR). A atual vai sem mínimo, como no login: quem
 * tem uma curta de antes precisa conseguir informá-la. A nova segue a regra de
 * sempre.
 *
 * A atual é OPCIONAL no contrato porque a troca obrigatória não a pede (AU): a
 * conta com a temporária acabou de prová-la no login. Fora dela, quem exige é o
 * use-case (`change-own-password.usecase.ts`).
 */
export const trocarSenhaSchema = z.strictObject({
  currentPassword: z.string('senha atual é obrigatória').max(128, 'senha atual: máximo de 128 caracteres').optional(),
  newPassword: senhaNova,
});

export const loginSchema = z.strictObject({
  // O e-mail é normalizado como no cadastro (`user.schema.ts`): `toLowerCase`
  // porque o Postgres compara texto com diferença de maiúscula, e "Ana@x.com"
  // não acharia a conta gravada como "ana@x.com". Sem conferir o FORMATO: um
  // e-mail malformado simplesmente não acha conta, e cai na mesma recusa de
  // "e-mail ou senha inválidos".
  email: z.string('e-mail é obrigatório').trim().toLowerCase()
    .min(1, 'e-mail é obrigatório')
    .max(320, 'e-mail: máximo de 320 caracteres'),
  // No LOGIN a senha não tem mínimo: quem já tem uma senha curta de antes
  // precisa continuar entrando, e recusar aqui por tamanho entregaria a regra
  // de comprimento a quem está adivinhando. Só o teto fica, contra corpo gigante.
  password: z.string('senha é obrigatória').max(128, 'senha: máximo de 128 caracteres'),
});

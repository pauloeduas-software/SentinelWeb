import { z } from 'zod';
import { nomeObrigatorio } from '../../shared/fields.schema';

// Contrato de entrada do login e da redefinição de senha. `strictObject` pelo
// mesmo motivo do resto do sistema: campo desconhecido vira 422 em vez de ser
// ignorado em silêncio — e aqui "ignorado em silêncio" seria um
// `{"username":"admin","password":"x","isAdmin":true}` passando batido.

// O `username` é normalizado antes de consultar: `toLowerCase` porque o
// Postgres compara texto com diferença de maiúscula, e sem isto "Admin" e
// "admin" seriam duas contas — uma delas impossível de criar pelo índice único,
// e outra impossível de logar por causa do que o usuário digitou.
const nomeDeAcesso = z.string('nome de acesso é obrigatório').trim().toLowerCase()
  .min(3, 'nome de acesso: mínimo de 3 caracteres')
  .max(64, 'nome de acesso: máximo de 64 caracteres')
  // Sem espaço nem acento: este texto vai para uma URL, um log e um `WHERE`, e
  // "joão silva " com espaço no fim é um chamado de suporte por mês.
  .regex(/^[a-z0-9._-]+$/, 'nome de acesso: use apenas letras, números, ponto, hífen e sublinhado');

// NADA de `trim` na senha: espaço no começo ou no fim é caractere como
// qualquer outro, e limpá-lo em silêncio faria a senha gravada ser diferente da
// senha digitada — um erro que só aparece no login seguinte.
//
// Mínimo de 12 e não de 8: o teto de tentativas defende contra ataque ONLINE;
// o comprimento é a única defesa contra força bruta offline num vazamento do
// banco. Teto de 128 porque argon2 aceita entrada grande e um corpo de 1 MB
// viraria negação de serviço de uma requisição só.
const senha = z.string('senha é obrigatória')
  .min(12, 'senha: mínimo de 12 caracteres')
  .max(128, 'senha: máximo de 128 caracteres');

export const loginSchema = z.strictObject({
  username: nomeDeAcesso,
  // No LOGIN a senha não tem mínimo: quem já tem uma senha curta de antes
  // precisa continuar entrando, e recusar aqui por tamanho entregaria a regra
  // de comprimento a quem está adivinhando. Só o teto fica, contra corpo gigante.
  password: z.string('senha é obrigatória').max(128, 'senha: máximo de 128 caracteres'),
});

export const setPasswordSchema = z.strictObject({
  password: senha,
  // Opcional: quem já tem nome de acesso só troca a senha.
  username: nomeDeAcesso.optional(),
});

/**
 * O nome de um token de agente.
 *
 * Obrigatório porque é a ÚNICA coisa que distingue um token do outro na tela: o
 * prefixo é aleatório e o `endpointId` só existe depois do primeiro handshake.
 * Um token sem nome numa lista de trinta é um que ninguém ousa revogar.
 */
export const issueTokenSchema = z.strictObject({
  name: nomeObrigatorio('nome do token'),
});

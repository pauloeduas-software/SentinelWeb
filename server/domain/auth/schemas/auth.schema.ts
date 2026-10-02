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

// ─────────────────────────────────────────────────────────────────────────────
// O SEGUNDO FATOR (F11, Etapa H)
//
// SEIS DÍGITOS EXATOS, validado na BORDA. O motivo de estar aqui e não só no
// helper: sem esta regra, `totp: "1"` chegaria ao use-case, pagaria um HMAC e
// contaria como tentativa errada — ou seja, cinco teclas sozinhas travariam a
// conta de quem esbarrou no teclado. Forma errada é 422 e não consome tentativa.
//
// `trim` porque o campo é colado do celular com espaço atrás; nada de `regex`
// com espaço no meio ("123 456"), que é como alguns autenticadores MOSTRAM o
// número — a tela tira o espaço antes de enviar, e aceitar as duas formas aqui
// faria o mesmo código ter duas representações válidas.
const codigoTotp = z.string('código é obrigatório').trim()
  .regex(/^\d{6}$/, 'código: exatamente 6 dígitos');

/**
 * Um código de recuperação, ou um do aplicativo — o campo único de "desativar".
 *
 * Teto de 32 e piso de 6: o do aplicativo tem 6 caracteres e o de recuperação
 * tem 11 (`XXXXX-XXXXX`). A normalização (caixa, hífen, espaço) é do
 * `totp.helper.ts`, porque ela é a MESMA que gerou o hash gravado — fazê-la aqui
 * duplicaria a regra em dois arquivos que precisam concordar para sempre.
 */
const codigoDeSegundoFator = z.string('código é obrigatório').trim()
  .min(6, 'código: mínimo de 6 caracteres')
  .max(32, 'código: máximo de 32 caracteres');

export const loginSchema = z.strictObject({
  username: nomeDeAcesso,
  // No LOGIN a senha não tem mínimo: quem já tem uma senha curta de antes
  // precisa continuar entrando, e recusar aqui por tamanho entregaria a regra
  // de comprimento a quem está adivinhando. Só o teto fica, contra corpo gigante.
  password: z.string('senha é obrigatória').max(128, 'senha: máximo de 128 caracteres'),

  // OS DOIS SÃO OPCIONAIS E EXCLUDENTES NA PRÁTICA, e não há `refine` exigindo
  // isso: quem manda os dois tem o `totp` conferido e o outro ignorado
  // (`conferirSegundoFator`). Um `refine` aqui recusaria com 422 um corpo que o
  // servidor sabe resolver, e 422 no login é pior que escolher um dos dois —
  // a pessoa veria "requisição inválida" tentando entrar.
  //
  // E A CONTA SEM 2FA QUE MANDA `totp` NÃO É ERRO: o campo é ignorado. Recusar
  // faria a tela precisar saber, ANTES do login, se a conta tem segundo fator —
  // e essa pergunta não tem resposta pública, de propósito.
  totp: codigoTotp.optional(),
  recoveryCode: codigoDeSegundoFator.optional(),
});

/** A confirmação do cadastro: só o código do aplicativo serve. */
export const confirmarTotpSchema = z.strictObject({ totp: codigoTotp });

/**
 * A desativação: o código do aplicativo OU um de recuperação, no mesmo campo.
 *
 * Um campo e não dois porque quem está desativando tem um dos dois na mão e não
 * precisa escolher a categoria do que digitou — o servidor tenta os dois
 * caminhos. Dois campos convidariam a colar o código de recuperação no campo
 * errado e levar "código inválido" de volta.
 */
export const desativarTotpSchema = z.strictObject({ codigo: codigoDeSegundoFator });

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

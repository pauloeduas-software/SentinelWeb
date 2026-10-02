import QRCode from 'qrcode';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { cifrar, decifrar } from '../../../core/crypto/cipher';
import type { ContextoDaRequisicao } from '../helpers/request-context.helper';
import {
  aadDoSegredoTotp, conferirCodigoTotp, consumirCodigoDeRecuperacao,
  gerarCodigosDeRecuperacao, gerarSegredoTotp, uriDoAutenticador,
} from '../helpers/totp.helper';
import { registrarEventoAuth } from './record-auth-event.usecase';

// CADASTRAR, CONFIRMAR E DESATIVAR o segundo fator (F11, Etapa H).
//
// ═════════════════════════════════════════════════════════════════════════════
// O CADASTRO É EM DOIS PASSOS, E O INTERMEDIÁRIO EXISTE NO BANCO.
//
// `enroll` grava o segredo com `totpEnabledAt` NULO; `confirm` confere um código
// e preenche a data. Entre os dois, o login continua pedindo só a senha.
//
// A alternativa — devolver o segredo e exigi-lo de volta no `confirm`, sem
// gravar nada — é tentadora porque não deixa estado pela metade. Ela tem dois
// defeitos: o segredo passaria a viajar do cliente para o servidor como se fosse
// um dado de entrada confiável (e o servidor gravaria o que o cliente mandou), e
// uma pessoa que fechasse a aba entre ler o QR e digitar o código ficaria com o
// autenticador configurado contra um segredo que o sistema esqueceu — ou seja,
// uma linha no celular que nunca vai funcionar, sem jeito de descobrir isso.
//
// Com o estado no banco, reabrir a tela de cadastro mostra um QR NOVO e invalida
// o anterior, que é o comportamento que a pessoa espera.
//
// E O QUE O ESTADO INTERMEDIÁRIO NÃO PODE FAZER: trancar ninguém. É por isso que
// o login olha `totpEnabledAt`, e não `totpSecret`.
// ═════════════════════════════════════════════════════════════════════════════

/** O que a tela precisa para desenhar o cadastro. */
export interface CadastroDeTotp {
  /** A URI `otpauth://` — o conteúdo do QR, para quem quiser copiar à mão. */
  uri: string;
  /** O segredo em base32, para digitação manual em autenticador sem câmera. */
  secret: string;
  /** PNG em data URL. Vem do servidor para o painel não carregar uma lib de QR. */
  qrcode: string;
}

/**
 * O estado do segundo fator de uma pessoa — para a tela decidir o que oferecer.
 *
 * NÃO SAI NO `USER_PUBLIC_SELECT`, e isso é o mesmo argumento do D136 aplicado a
 * outro dado: "esta pessoa tem 2FA" não é campo de colaborador para viajar
 * embutido em toda posse e toda ocupação do inventário. Sai por esta rota, que é
 * a que pergunta sobre si mesma.
 */
export interface StatusDoTotp {
  ativo: boolean;
  /** `null` quando não está ativo — não é zero, é "não se aplica". */
  codigosRestantes: number | null;
  /** Há segredo gravado esperando confirmação? É o que decide o rótulo do botão. */
  cadastroPendente: boolean;
}

const SELECT_DO_FATOR = {
  id: true,
  username: true,
  email: true,
  totpSecret: true,
  totpEnabledAt: true,
  totpRecoveryCodes: true,
} as const;

/** A pessoa, ou 401 — o `preHandler` já garantiu a sessão; isto é a releitura. */
async function lerPessoa(userId: string) {
  const pessoa = await prisma.user.findFirst({ where: { id: userId }, select: SELECT_DO_FATOR });
  // Chegar aqui sem pessoa significa que a sessão sobreviveu ao cadastro por
  // alguns milissegundos. 401 e não 404: o que não existe é quem está pedindo.
  if (!pessoa) throw new AppError('Sessão ausente ou expirada. Faça login.', 401);
  return pessoa;
}

export async function statusDoTotp(userId: string): Promise<StatusDoTotp> {
  const pessoa = await lerPessoa(userId);
  const ativo = pessoa.totpEnabledAt !== null;

  return {
    ativo,
    codigosRestantes: ativo ? pessoa.totpRecoveryCodes.length : null,
    cadastroPendente: !ativo && pessoa.totpSecret !== null,
  };
}

/**
 * Passo 1: gera o segredo, guarda cifrado e devolve o QR.
 *
 * O SEGREDO SAI NO CORPO DA RESPOSTA, e é a única vez. Não é furo: ele é o dado
 * que a pessoa precisa levar para o próprio celular, e quem pede é a sessão
 * dela. A rota é de credencial (`no-store`, `Origin` conferida, rate limit de
 * escrita) justamente porque a resposta carrega segredo.
 */
export async function iniciarCadastroTotp(userId: string): Promise<CadastroDeTotp> {
  const pessoa = await lerPessoa(userId);

  // JÁ ATIVO É 409, e não "gera outro": trocar o autenticador sem provar que
  // controla o atual é o caminho por onde quem roubou uma sessão expulsa o dono
  // da própria conta. Para trocar, desative (o que exige um código) e cadastre.
  if (pessoa.totpEnabledAt) {
    throw new AppError(
      'O segundo fator já está ativo nesta conta. Desative-o antes de cadastrar outro aplicativo.',
      409,
    );
  }

  const secret = gerarSegredoTotp();

  await prisma.user.update({
    where: { id: userId },
    data: {
      // CIFRADO, com o AAD da linha (D81): a cópia deste valor para a linha de
      // outra pessoa não decifra, então quem tem acesso ao banco não transforma
      // o próprio cadastro no autenticador de um administrador.
      totpSecret: cifrar(secret, aadDoSegredoTotp(userId)),
      // Os dois zerados: um cadastro novo não herda códigos de recuperação de uma
      // tentativa anterior, e `enabledAt` nulo é o que mantém o login liberado.
      totpEnabledAt: null,
      totpRecoveryCodes: [],
    },
  });

  const conta = pessoa.username ?? pessoa.email;
  const uri = uriDoAutenticador({ secret, conta });

  return { uri, secret, qrcode: await QRCode.toDataURL(uri) };
}

/**
 * Passo 2: confere o primeiro código e ATIVA, devolvendo os códigos de recuperação.
 *
 * Os códigos são mostrados UMA vez. Não há rota para relê-los, e é essa ausência
 * que faz o sha256 valer alguma coisa — a mesma regra do token de API (D80).
 * Quem os perder desativa e cadastra de novo, que é barato.
 */
export async function confirmarCadastroTotp(
  userId: string,
  codigo: string,
  ctx?: ContextoDaRequisicao,
): Promise<{ codigosDeRecuperacao: string[] }> {
  const pessoa = await lerPessoa(userId);

  if (pessoa.totpEnabledAt) {
    throw new AppError('O segundo fator já está ativo nesta conta.', 409);
  }
  if (!pessoa.totpSecret) {
    throw new AppError('Nenhum cadastro em andamento. Leia o QR Code antes de confirmar.', 409);
  }

  const secret = decifrar(pessoa.totpSecret, aadDoSegredoTotp(userId));

  if (!(await conferirCodigoTotp(secret, codigo))) {
    // 422 E NÃO 401: a sessão é válida e a requisição é bem-formada — o que não
    // confere é o VALOR. Um 401 aqui faria o `apiClient` do painel entender
    // "sessão perdida" e jogar a pessoa para a tela de login no meio do cadastro.
    //
    // O EVENTO é `TOTP_FAIL`: o cadastro é o único lugar em que errar o código
    // não é suspeito (relógio dessincronizado, QR lido pela metade), e é por isso
    // mesmo que registrar ajuda — uma sequência deles explica o chamado.
    await registrarEventoAuth({ type: 'TOTP_FAIL', userId, username: pessoa.username, ctx });
    throw new AppError('Código inválido. Confira o aplicativo e tente novamente.', 422);
  }

  const codigos = gerarCodigosDeRecuperacao();

  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabledAt: new Date(), totpRecoveryCodes: codigos.hashes },
  });

  // NÃO INCREMENTA `tokenVersion`: ativar o segundo fator não é motivo para
  // derrubar as sessões abertas da própria pessoa que acabou de ativá-lo — ela
  // está usando uma delas. Quem derruba tudo é a troca de senha, porque ali o
  // pressuposto é que a credencial vazou.
  await registrarEventoAuth({ type: 'TOTP_ENABLED', userId, username: pessoa.username, ctx });

  return { codigosDeRecuperacao: codigos.emClaro };
}

/**
 * Desativa — exigindo um código válido (do aplicativo ou de recuperação).
 *
 * POR QUE EXIGIR CÓDIGO PARA DESLIGAR: sem isso, quem roubasse uma sessão
 * aberta desligaria o segundo fator com um clique e a defesa valeria só contra
 * quem tem a senha. Com ele, a sessão roubada não basta.
 *
 * E POR QUE NÃO EXISTE ROTA PARA UM ADMINISTRADOR DESLIGAR O DE OUTRO: uma rota
 * de bypass é a porta que o 2FA veio fechar — bastaria comprometer uma conta com
 * `access.manage` para esvaziar o segundo fator de todo mundo. Quem perdeu o
 * celular E os códigos é destravado por COMANDO DE LINHA, que exige acesso ao
 * servidor (`npm run totp:desativar`).
 */
export async function desativarTotp(
  userId: string,
  codigo: string,
  ctx?: ContextoDaRequisicao,
): Promise<{ ativo: false }> {
  const pessoa = await lerPessoa(userId);

  if (!pessoa.totpEnabledAt || !pessoa.totpSecret) {
    throw new AppError('O segundo fator não está ativo nesta conta.', 409);
  }

  const secret = decifrar(pessoa.totpSecret, aadDoSegredoTotp(userId));
  const porAplicativo = await conferirCodigoTotp(secret, codigo);
  const porRecuperacao = porAplicativo
    ? null
    : consumirCodigoDeRecuperacao(codigo, pessoa.totpRecoveryCodes);

  if (!porAplicativo && !porRecuperacao) {
    await registrarEventoAuth({ type: 'TOTP_FAIL', userId, username: pessoa.username, ctx });
    throw new AppError('Código inválido. Use o aplicativo ou um código de recuperação.', 422);
  }

  await prisma.user.update({
    where: { id: userId },
    // AS TRÊS COLUNAS JUNTAS. Deixar os códigos de recuperação para trás seria
    // guardar uma credencial válida de um mecanismo desligado — e ela voltaria a
    // valer no próximo cadastro se a limpeza do `enroll` falhasse.
    data: { totpSecret: null, totpEnabledAt: null, totpRecoveryCodes: [] },
  });

  await registrarEventoAuth({ type: 'TOTP_DISABLED', userId, username: pessoa.username, ctx });

  return { ativo: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// O QUE O LOGIN CHAMA
// ─────────────────────────────────────────────────────────────────────────────

/** O recorte das colunas do fator que o `login.usecase` já traz na consulta dele. */
export interface FatorDaPessoa {
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  totpRecoveryCodes: string[];
}

export type ResultadoDoSegundoFator =
  /** Passou pelo aplicativo. Nada a gravar. */
  | { ok: true; via: 'TOTP' }
  /** Passou por código de recuperação, que QUEIMOU: `restantes` tem de ser gravado. */
  | { ok: true; via: 'RECUPERACAO'; restantes: string[] }
  /** A conta exige o fator e o corpo não trouxe nenhum. */
  | { ok: false; motivo: 'AUSENTE' }
  | { ok: false; motivo: 'INVALIDO' };

/**
 * A senha conferiu. E o segundo fator?
 *
 * SEM ESCRITA NENHUMA AQUI, de propósito: quando o código de recuperação é
 * consumido, quem grava é o `login.usecase` — no MESMO `update` que zera o
 * contador de tentativas e carimba `lastLoginAt`. Dois `update` na mesma linha no
 * mesmo login seriam duas idas ao banco e uma janela entre elas em que o código já
 * estaria queimado para uma sessão que ainda podia falhar.
 *
 * `userId` entra só para o AAD — é ele que amarra o segredo à linha.
 */
export async function conferirSegundoFator(
  userId: string,
  fator: FatorDaPessoa,
  entrada: { totp?: string; recoveryCode?: string },
): Promise<ResultadoDoSegundoFator> {
  // Conta sem segundo fator ATIVO não exige nada. Segredo pendente de
  // confirmação cai aqui também — e é o ponto do estado intermediário.
  if (!fator.totpEnabledAt || !fator.totpSecret) return { ok: true, via: 'TOTP' };

  const temAlgo = Boolean(entrada.totp?.trim() || entrada.recoveryCode?.trim());
  if (!temAlgo) return { ok: false, motivo: 'AUSENTE' };

  if (entrada.totp?.trim()) {
    const secret = decifrar(fator.totpSecret, aadDoSegredoTotp(userId));
    if (await conferirCodigoTotp(secret, entrada.totp)) return { ok: true, via: 'TOTP' };
    // CÓDIGO DO APLICATIVO ERRADO NÃO CAI NO DE RECUPERAÇÃO: são campos
    // diferentes na tela, e tentar um como o outro faria uma tentativa contar
    // duas vezes contra a lista de oito.
    return { ok: false, motivo: 'INVALIDO' };
  }

  const recuperacao = consumirCodigoDeRecuperacao(entrada.recoveryCode ?? '', fator.totpRecoveryCodes);
  if (!recuperacao) return { ok: false, motivo: 'INVALIDO' };

  return { ok: true, via: 'RECUPERACAO', restantes: recuperacao.restantes };
}

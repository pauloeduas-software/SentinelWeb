import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateSync } from 'otplib';
import { prisma } from '../../server/core/database/prismaClient';
import { COOKIE_SESSAO } from '../../server/domain/auth/helpers/session-cookie.helper';
import { clienteComSessao, criarApi, type ApiDeTeste, type Cliente } from '../helpers/app';

// O SEGUNDO FATOR (F11, Etapa H) — tudo por HTTP, inclusive o login.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ESTE ARQUIVO PRECISA DE UMA CONTA PRÓPRIA, COM SENHA CONHECIDA.
//
// O `comoUsuario()` do harness devolve um CLIENTE já logado e não devolve as
// credenciais — e aqui o que se testa é justamente o LOGIN: a mesma conta tem de
// entrar várias vezes, com código, sem código e com código errado. Então a conta
// nasce pelas rotas (`POST /api/users` + `/set-password`) e o teste guarda o
// `username`/`password` para repetir a entrada.
//
// O CÓDIGO VÁLIDO É CALCULADO NO TESTE, com o `generateSync` da própria otplib
// sobre o segredo que o `enroll` devolveu. É a única forma honesta: um código
// fixo no arquivo valeria por 30 segundos, uma vez, em 1970.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;

/** A conta que cadastra o segundo fator. */
const SENHA = 'Senha-Do-Segundo-Fator-1';
let username = '';
let userId = '';

/** O segredo em base32, como o `enroll` o devolveu — é com ele que o teste gera código. */
let secret = '';
/** Os oito códigos em claro, como a confirmação os entregou. */
let codigosDeRecuperacao: string[] = [];

interface Status {
  ativo: boolean;
  codigosRestantes: number | null;
  cadastroPendente: boolean;
}

/** O cliente da conta de teste, logado — refeito a cada login do arquivo. */
let dela: Cliente;

/** Um código válido AGORA para o segredo cadastrado. */
function codigoValido(): string {
  return generateSync({ secret });
}

/**
 * Entra pela rota de login, do zero.
 *
 * Devolve status e corpo em vez de lançar: metade das asserções deste arquivo é
 * sobre a RECUSA (401 com `etapa`), e um helper que estourasse no 401 obrigaria
 * cada teste a montar o `inject` na mão.
 */
async function entrar(corpo: Record<string, unknown>) {
  const resposta = await api.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password: SENHA, ...corpo },
  });

  return {
    status: resposta.statusCode,
    body: JSON.parse(resposta.body || '{}') as Record<string, unknown>,
    cookie: resposta.cookies.find((c) => c.name === COOKIE_SESSAO)?.value ?? null,
  };
}

/** O contador de tentativas e a trava, direto da linha — é o que o login escreve. */
async function tentativas() {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { failedLoginCount: true, lockedUntil: true },
  });
}

async function eventos(tipo: string): Promise<number> {
  return prisma.authEvent.count({ where: { userId, type: tipo as 'TOTP_FAIL' } });
}

/** Zera a trava que um teste de código errado acabou de criar. */
async function destravar() {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}

beforeAll(async () => {
  api = await criarApi();

  const marca = `f2a${Date.now()}`;
  username = marca;

  const pessoa = await api.post<{ id: string }>('/api/users', {
    name: 'Pessoa do Segundo Fator',
    email: `${marca}@teste.local`,
  });
  expect(pessoa.status).toBe(201);
  userId = pessoa.body.id;

  const credencial = await api.post(`/api/users/${userId}/set-password`, {
    username, password: SENHA,
  });
  expect(credencial.status).toBe(200);

  const entrada = await entrar({});
  expect(entrada.status).toBe(200);
  // O CLIENTE É REMONTADO A PARTIR DO COOKIE deste login: o arquivo entra várias
  // vezes com a mesma conta, e o cliente do harness guarda só a sessão do
  // administrador.
  dela = clienteComSessao(api.app, entrada.cookie!);
});

afterAll(async () => { await api.fechar(); });

describe('o cadastro é em dois passos, e o primeiro não tranca ninguém', () => {
  it('o enroll devolve QR, URI e segredo — e o login continua só com a senha', async () => {
    const enroll = await dela.post<{ uri: string; secret: string; qrcode: string }>(
      '/api/auth/totp/enroll',
    );

    expect(enroll.status).toBe(200);
    expect(enroll.body.uri).toContain('otpauth://totp/SentinelWeb');
    expect(enroll.body.secret).toMatch(/^[A-Z2-7]{16,}$/);
    // O QR vem do SERVIDOR como data URL: é o que dispensa uma biblioteca de QR
    // no bundle do painel.
    expect(enroll.body.qrcode.startsWith('data:image/png;base64,')).toBe(true);

    secret = enroll.body.secret;

    const status = await dela.get<Status>('/api/auth/totp');
    expect(status.body).toEqual({ ativo: false, codigosRestantes: null, cadastroPendente: true });

    // ESTA É A ASSERÇÃO QUE IMPORTA do estado intermediário: há segredo gravado e
    // o login NÃO pede código. Quem fechou a aba depois de ler o QR não ficou
    // trancado fora.
    const entrada = await entrar({});
    expect(entrada.status).toBe(200);
  });

  it('confirmar com código errado é 422, e nada é ativado', async () => {
    const resposta = await dela.post<{ error: string }>('/api/auth/totp/confirm', { totp: '000000' });

    // 422 e não 401: a sessão é válida, o VALOR é que não confere. Um 401 aqui
    // faria o painel entender "sessão perdida" e jogar a pessoa para o login no
    // meio do cadastro.
    expect(resposta.status).toBe(422);

    const status = await dela.get<Status>('/api/auth/totp');
    expect(status.body.ativo).toBe(false);
  });

  it('forma errada é 422 do zod e NÃO chega a contar como tentativa', async () => {
    const antes = await eventos('TOTP_FAIL');
    const resposta = await dela.post('/api/auth/totp/confirm', { totp: '12' });

    expect(resposta.status).toBe(422);
    // A borda recusou: cinco teclas no teclado não podem gastar uma das tentativas
    // nem sujar a trilha de autenticação.
    expect(await eventos('TOTP_FAIL')).toBe(antes);
  });

  it('confirmar com o código do aplicativo ativa e entrega OITO códigos de recuperação', async () => {
    const resposta = await dela.post<{ codigosDeRecuperacao: string[] }>(
      '/api/auth/totp/confirm',
      { totp: codigoValido() },
    );

    expect(resposta.status).toBe(200);
    expect(resposta.body.codigosDeRecuperacao).toHaveLength(8);
    // `XXXXX-XXXXX` num alfabeto sem `I`, `L`, `O` e `U`: o código é lido de um
    // papel, e `0`/`O` é o erro de digitação que vira chamado.
    for (const codigo of resposta.body.codigosDeRecuperacao) {
      expect(codigo).toMatch(/^[0-9A-HJ-NP-TV-Z]{5}-[0-9A-HJ-NP-TV-Z]{5}$/);
    }

    codigosDeRecuperacao = resposta.body.codigosDeRecuperacao;

    const status = await dela.get<Status>('/api/auth/totp');
    expect(status.body).toEqual({ ativo: true, codigosRestantes: 8, cadastroPendente: false });
  });

  it('o que foi gravado é CIFRADO, não o segredo em claro', async () => {
    const linha = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpSecret: true, totpRecoveryCodes: true },
    });

    // O formato do `core/crypto/cipher.ts` (D81): `enc:v1:<kid>:<iv>:<tag>:<ct>`.
    expect(linha.totpSecret).toMatch(/^enc:v1:/);
    // E o segredo em claro NÃO aparece em nenhum pedaço do pacote.
    expect(linha.totpSecret).not.toContain(secret);

    // Os códigos de recuperação são SHA-256 (64 hexadecimais), não o texto do papel.
    expect(linha.totpRecoveryCodes).toHaveLength(8);
    for (const guardado of linha.totpRecoveryCodes) {
      expect(guardado).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const claro of codigosDeRecuperacao) {
      expect(linha.totpRecoveryCodes).not.toContain(claro);
    }
  });

  it('cadastrar de novo com o fator ATIVO é 409', async () => {
    const resposta = await dela.post<{ error: string }>('/api/auth/totp/enroll');

    expect(resposta.status).toBe(409);
    expect(resposta.body.error).toMatch(/desative/i);
  });
});

describe('o login com segundo fator', () => {
  it('senha certa sem código é 401 com `etapa: TOTP` — e NÃO conta tentativa', async () => {
    const entrada = await entrar({});

    expect(entrada.status).toBe(401);
    // `etapa` É O CONTRATO COM A TELA: sem ele, o painel diria "senha inválida"
    // para quem digitou a senha certa.
    expect(entrada.body.etapa).toBe('TOTP');
    expect(entrada.cookie).toBeNull();

    // O primeiro envio de quem tem 2FA chega aqui SEMPRE (a tela pede senha e
    // código em dois momentos). Contar isso travaria a conta de quem acertou a
    // senha cinco vezes seguidas.
    expect((await tentativas()).failedLoginCount).toBe(0);
    expect(await eventos('TOTP_REQUIRED')).toBeGreaterThan(0);
  });

  it('código errado é 401 com `etapa` E CONTA tentativa', async () => {
    const entrada = await entrar({ totp: '000000' });

    expect(entrada.status).toBe(401);
    expect(entrada.body.etapa).toBe('TOTP');
    // CONTA, ao contrário do caso de cima: seis dígitos com três códigos válidos
    // por janela seriam o único campo do sistema com tentativa ilimitada.
    expect((await tentativas()).failedLoginCount).toBe(1);

    await destravar();
  });

  it('código do aplicativo entra, e a resposta traz as permissões', async () => {
    const entrada = await entrar({ totp: codigoValido() });

    expect(entrada.status).toBe(200);
    expect(entrada.cookie).toBeTruthy();
    expect(Array.isArray(entrada.body.permissions)).toBe(true);
    expect((await tentativas()).failedLoginCount).toBe(0);
  });

  it('cinco códigos errados travam a conta — o mesmo contador da senha', async () => {
    for (let i = 0; i < 5; i += 1) {
      const erro = await entrar({ totp: '000000' });
      expect(erro.status).toBe(401);
    }

    const travada = await entrar({ totp: codigoValido() });
    // 423 com o código CERTO: a trava vale para a senha e para o fator, senão
    // bastaria acertar o código depois de esgotar as tentativas.
    expect(travada.status).toBe(423);

    await destravar();
  });

  it('código de recuperação entra, QUEIMA, e deixa sete', async () => {
    const usado = codigosDeRecuperacao[0];
    const entrada = await entrar({ recoveryCode: usado });

    expect(entrada.status).toBe(200);
    expect(await eventos('TOTP_RECOVERY_USED')).toBe(1);

    const status = await dela.get<Status>('/api/auth/totp');
    expect(status.body.codigosRestantes).toBe(7);
  });

  it('o mesmo código de recuperação NÃO serve duas vezes', async () => {
    const repetido = await entrar({ recoveryCode: codigosDeRecuperacao[0] });

    expect(repetido.status).toBe(401);
    expect(repetido.body.etapa).toBe('TOTP');

    await destravar();
  });

  it('código de recuperação é aceito com espaço, caixa baixa e sem hífen', async () => {
    // Quem lê de um papel digita de qualquer jeito. A normalização é do helper, e
    // ela é a MESMA que gerou o hash gravado — se não fosse, o código certo
    // digitado em caixa baixa nunca casaria.
    const cru = codigosDeRecuperacao[1];
    const bagunçado = ` ${cru.replace('-', ' ').toLowerCase()} `;

    const entrada = await entrar({ recoveryCode: bagunçado });
    expect(entrada.status).toBe(200);

    const status = await dela.get<Status>('/api/auth/totp');
    expect(status.body.codigosRestantes).toBe(6);
  });
});

describe('o que nunca sai por rota nenhuma', () => {
  it('`totpSecret` e `totpRecoveryCodes` não aparecem em `/api/auth/me`', async () => {
    const resposta = await dela.get<Record<string, unknown>>('/api/auth/me');

    expect(resposta.status).toBe(200);
    // AUSENTES, não nulos — a mesma distinção do `dado-sensivel.test.ts`: nulo
    // significaria que a coluna foi LIDA e chegou até a serialização.
    expect(Object.hasOwn(resposta.body, 'totpSecret')).toBe(false);
    expect(Object.hasOwn(resposta.body, 'totpRecoveryCodes')).toBe(false);
    expect(Object.hasOwn(resposta.body, 'totpEnabledAt')).toBe(false);
  });

  it('nem na ficha do colaborador, nem na listagem de pessoas', async () => {
    const ficha = await api.get<Record<string, unknown>>(`/api/users/${userId}`);
    expect(ficha.status).toBe(200);
    expect(Object.hasOwn(ficha.body, 'totpSecret')).toBe(false);
    expect(Object.hasOwn(ficha.body, 'totpRecoveryCodes')).toBe(false);

    const listagem = await api.get<{ rows: Record<string, unknown>[] }>('/api/users');
    expect(listagem.status).toBe(200);
    const linha = listagem.body.rows.find((r) => r.id === userId);
    expect(linha).toBeDefined();
    expect(Object.hasOwn(linha!, 'totpSecret')).toBe(false);

    // E a varredura que fecha o caso: o segredo em claro não está em NENHUM lugar
    // dos dois corpos — nem embutido numa relação, nem num campo com outro nome.
    expect(JSON.stringify(ficha.body)).not.toContain(secret);
    expect(JSON.stringify(listagem.body)).not.toContain(secret);
  });
});

describe('desativar exige provar que controla o fator', () => {
  it('código errado é 422 e o fator continua ativo', async () => {
    const resposta = await dela.post('/api/auth/totp/disable', { codigo: '000000' });
    expect(resposta.status).toBe(422);

    const status = await dela.get<Status>('/api/auth/totp');
    expect(status.body.ativo).toBe(true);
  });

  it('com o código do aplicativo, desativa — e o login volta a ser só senha', async () => {
    const resposta = await dela.post('/api/auth/totp/disable', { codigo: codigoValido() });
    expect(resposta.status).toBe(200);

    const status = await dela.get<Status>('/api/auth/totp');
    expect(status.body).toEqual({ ativo: false, codigosRestantes: null, cadastroPendente: false });

    // AS TRÊS COLUNAS limpas: deixar os códigos de recuperação para trás guardaria
    // credencial válida de um mecanismo desligado.
    const linha = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpSecret: true, totpEnabledAt: true, totpRecoveryCodes: true },
    });
    expect(linha).toEqual({ totpSecret: null, totpEnabledAt: null, totpRecoveryCodes: [] });

    const entrada = await entrar({});
    expect(entrada.status).toBe(200);
    expect(await eventos('TOTP_DISABLED')).toBe(1);
  });

  it('desativar o que não está ativo é 409', async () => {
    const resposta = await dela.post('/api/auth/totp/disable', { codigo: '000000' });
    expect(resposta.status).toBe(409);
  });
});

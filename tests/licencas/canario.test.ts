import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { prisma } from '../../server/core/database/prismaClient';
import { verificarCanarioDeCriptografia } from '../../server/core/crypto/canary';
import { cifrar, kidDoPacote } from '../../server/core/crypto/cipher';
import { chaveiro } from '../../server/core/crypto/keyring';

// O CANÁRIO NO BOOT (D91) — a defesa contra a troca silenciosa de chave.
//
// ═════════════════════════════════════════════════════════════════════════════
// O QUE ELE PROTEGE, e por que o teste precisa mexer no ambiente.
//
// Trocar `APP_ENCRYPTION_KEY` torna toda chave de produto gravada ilegível, e
// sem o canário o sistema SOBE PERFEITO: as telas abrem, as licenças listam, os
// assentos entregam. A falha aparece semanas depois, no primeiro clique em
// "revelar chave" — um 500 no meio de uma tela, com a causa já invisível.
//
// Provar isso exige trocar a variável de ambiente no meio do teste, e é por
// isso que o `keyring.ts` lê o ambiente A CADA CHAMADA em vez de memoizar.
// ═════════════════════════════════════════════════════════════════════════════

const SINGLETON = 'singleton';

/** Chaves válidas (32 bytes em hex) e diferentes entre si. */
const CHAVE_A = '0000000000000000000000000000000000000000000000000000000000000001';
const CHAVE_B = '0000000000000000000000000000000000000000000000000000000000000002';

let api: ApiDeTeste;
const chaveOriginal = process.env.APP_ENCRYPTION_KEY;
const antigasOriginais = process.env.APP_ENCRYPTION_KEYS_ANTIGAS;

/** O ambiente volta ao que era, senão o próximo arquivo herda a troca. */
function restaurarAmbiente() {
  if (chaveOriginal === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = chaveOriginal;

  if (antigasOriginais === undefined) delete process.env.APP_ENCRYPTION_KEYS_ANTIGAS;
  else process.env.APP_ENCRYPTION_KEYS_ANTIGAS = antigasOriginais;
}

async function lerCanario(): Promise<string | null> {
  const linha = await prisma.appSetting.findUnique({
    where: { id: SINGLETON },
    select: { cryptoCanary: true },
  });
  return linha?.cryptoCanary ?? null;
}

async function apagarCanario() {
  await prisma.appSetting.updateMany({ where: { id: SINGLETON }, data: { cryptoCanary: null } });
}

function kidDe(chaveHex: string): string {
  const anterior = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = chaveHex;
  const kid = chaveiro().ativa!.kid;
  if (anterior === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = anterior;
  return kid;
}

beforeAll(async () => {
  // A API sobe só para garantir a linha `singleton` de `app_settings` e o
  // schema migrado; os testes daqui chamam o canário direto.
  api = await criarApi();
});

afterEach(restaurarAmbiente);

afterAll(async () => {
  restaurarAmbiente();
  await api.fechar();
});

describe('o primeiro boot', () => {
  it('grava o canário quando ele não existe', async () => {
    process.env.APP_ENCRYPTION_KEY = CHAVE_A;
    await apagarCanario();

    await verificarCanarioDeCriptografia();

    const gravado = await lerCanario();
    expect(gravado).toMatch(/^enc:v1:[0-9a-f]{8}:/);
    expect(kidDoPacote(gravado!)).toBe(kidDe(CHAVE_A));
  });

  it('sem chave configurada não grava nada e deixa o boot seguir', async () => {
    // Derrubar aqui obrigaria todo ambiente de desenvolvimento a configurar uma
    // chave para abrir uma tela de ativos. Quem recusa gravar chave de produto
    // é o use-case, com 422.
    delete process.env.APP_ENCRYPTION_KEY;
    await apagarCanario();

    await expect(verificarCanarioDeCriptografia()).resolves.toBeUndefined();
    expect(await lerCanario()).toBeNull();
  });
});

describe('a troca acidental de chave', () => {
  it('DERRUBA o boot, e a mensagem ensina as duas saídas', async () => {
    process.env.APP_ENCRYPTION_KEY = CHAVE_A;
    await apagarCanario();
    await verificarCanarioDeCriptografia();

    // O deploy que troca a variável sem pôr a antiga no chaveiro.
    process.env.APP_ENCRYPTION_KEY = CHAVE_B;
    delete process.env.APP_ENCRYPTION_KEYS_ANTIGAS;

    await expect(verificarCanarioDeCriptografia()).rejects.toThrow(
      /Chave de criptografia incompatível/,
    );

    // As DUAS saídas escritas: a rotação de propósito e a troca acidental.
    // Escolher a errada destrói dado, então nenhuma delas pode ficar implícita.
    await expect(verificarCanarioDeCriptografia()).rejects.toThrow(
      /APP_ENCRYPTION_KEYS_ANTIGAS[\s\S]*restaure o valor anterior/,
    );
  });

  it('e o canário gravado NÃO é sobrescrito pela chave nova', async () => {
    // A regravação só acontece depois de o canário CONFERIR. Se ela acontecesse
    // antes, o boot seguinte passaria feliz — e o canário teria apagado a única
    // prova de que a chave mudou por baixo dos dados.
    expect(kidDoPacote((await lerCanario())!)).toBe(kidDe(CHAVE_A));
  });
});

describe('a rotação de chave', () => {
  it('sobe com a antiga no chaveiro e REGRAVA o canário com a ativa', async () => {
    process.env.APP_ENCRYPTION_KEY = CHAVE_A;
    await apagarCanario();
    await verificarCanarioDeCriptografia();
    expect(kidDoPacote((await lerCanario())!)).toBe(kidDe(CHAVE_A));

    // A rotação como o `.env.example` a descreve: a nova cifra, a antiga
    // continua decifrando o que já existe.
    process.env.APP_ENCRYPTION_KEY = CHAVE_B;
    process.env.APP_ENCRYPTION_KEYS_ANTIGAS = CHAVE_A;

    await expect(verificarCanarioDeCriptografia()).resolves.toBeUndefined();

    // ═══════════════════════════════════════════════════════════════════════
    // A LINHA QUE FAZ A ROTAÇÃO TER FIM.
    //
    // Sem a regravação, o canário ficaria preso ao `kid` da chave A para
    // sempre. Depois de recifrar todas as chaves de produto com a B, tirar a A
    // do `APP_ENCRYPTION_KEYS_ANTIGAS` derrubaria o boot — e a mensagem mandaria
    // pôr a A de volta, que é o oposto de terminar a rotação.
    // ═══════════════════════════════════════════════════════════════════════
    expect(kidDoPacote((await lerCanario())!)).toBe(kidDe(CHAVE_B));
  });

  it('e aí a chave antiga pode sair do ambiente sem derrubar nada', async () => {
    // O passo seguinte do operador, e o que o teste acima existe para permitir.
    process.env.APP_ENCRYPTION_KEY = CHAVE_B;
    delete process.env.APP_ENCRYPTION_KEYS_ANTIGAS;

    await expect(verificarCanarioDeCriptografia()).resolves.toBeUndefined();
  });

  it('mas o valor cifrado com a antiga continua ilegível sem ela — o canário não mente sobre isso', async () => {
    // O que a regravação NÃO promete, e está escrito no log dela: ela prova que
    // o processo abre o CANÁRIO, não que toda linha já foi recifrada. Quem
    // cuida disso é a recifragem.
    process.env.APP_ENCRYPTION_KEY = CHAVE_A;
    const antigo = cifrar('segredo', 'licenses:productKey:qualquer');

    process.env.APP_ENCRYPTION_KEY = CHAVE_B;
    delete process.env.APP_ENCRYPTION_KEYS_ANTIGAS;

    expect(chaveiro().porKid.has(kidDoPacote(antigo)!)).toBe(false);
  });
});

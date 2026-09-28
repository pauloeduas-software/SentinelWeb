import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarLicenca, idsDoSeed } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';
import { verificarCanarioDeCriptografia, type ColunaCifrada } from '../../server/core/crypto/canary';
import { colunasCifradasDaLicenca } from '../../server/domain/license/helpers/coluna-cifrada.helper';
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

/**
 * "Não há nada cifrado neste sistema."
 *
 * É o que o canário conclui quando a lista vem vazia, e é por isso que ela é
 * parâmetro OBRIGATÓRIO: um `= []` de conveniência na assinatura faria qualquer
 * chamador esquecido receber "o chaveiro abre tudo" de graça.
 */
const NADA_CIFRADO: ColunaCifrada[] = [];

/** Uma coluna cifrada de mentira, com os `kid` que o teste quiser. */
function colunaCom(...kids: string[]): ColunaCifrada[] {
  return [{ descricao: 'tabela.coluna', kidsGuardados: async () => kids }];
}

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

    await verificarCanarioDeCriptografia(NADA_CIFRADO);

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

    await expect(verificarCanarioDeCriptografia(NADA_CIFRADO)).resolves.toBeUndefined();
    expect(await lerCanario()).toBeNull();
  });
});

describe('a troca acidental de chave, COM dado ilegível', () => {
  it('DERRUBA o boot, e a mensagem ensina as duas saídas', async () => {
    process.env.APP_ENCRYPTION_KEY = CHAVE_A;
    await apagarCanario();
    await verificarCanarioDeCriptografia(NADA_CIFRADO);

    // O deploy que troca a variável sem pôr a antiga no chaveiro.
    process.env.APP_ENCRYPTION_KEY = CHAVE_B;
    delete process.env.APP_ENCRYPTION_KEYS_ANTIGAS;

    // E HÁ VALOR GRAVADO COM A CHAVE QUE SUMIU — é isto que torna o alarme
    // verdadeiro. Sem esta linha o canário não tem o direito de derrubar o boot,
    // e é exatamente o que ele fazia antes: inferia da própria falha que todo
    // dado estava ilegível.
    const ilegivel = colunaCom(kidDe(CHAVE_A));

    await expect(verificarCanarioDeCriptografia(ilegivel)).rejects.toThrow(
      /Chave de criptografia incompatível/,
    );

    // QUANTOS e com QUAL kid — "toda chave de produto está ilegível" não dizia
    // nem uma coisa nem outra, e a diferença é entre restaurar uma chave e
    // reescrever três linhas à mão.
    await expect(verificarCanarioDeCriptografia(ilegivel)).rejects.toThrow(
      new RegExp(`1 em tabela\\.coluna \\(kid ${kidDe(CHAVE_A)}\\)`),
    );

    // As DUAS saídas escritas: a rotação de propósito e a troca acidental.
    // Escolher a errada destrói dado, então nenhuma delas pode ficar implícita.
    await expect(verificarCanarioDeCriptografia(ilegivel)).rejects.toThrow(
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
    await verificarCanarioDeCriptografia(NADA_CIFRADO);
    expect(kidDoPacote((await lerCanario())!)).toBe(kidDe(CHAVE_A));

    // A rotação como o `.env.example` a descreve: a nova cifra, a antiga
    // continua decifrando o que já existe.
    process.env.APP_ENCRYPTION_KEY = CHAVE_B;
    process.env.APP_ENCRYPTION_KEYS_ANTIGAS = CHAVE_A;

    // A coluna carrega valor da chave A, e A está no chaveiro: nada ilegível.
    await expect(verificarCanarioDeCriptografia(colunaCom(kidDe(CHAVE_A)))).resolves.toBeUndefined();

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

    await expect(verificarCanarioDeCriptografia(NADA_CIFRADO)).resolves.toBeUndefined();
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

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ O ALARME FALSO QUE TRANCAVA O AMBIENTE
//
// Este bloco nasceu de um `bun run dev` que não subia. O banco tinha:
//
//   - canário cifrado pela chave "b16fb979", que já não estava no ambiente;
//   - a única chave de produto gravada cifrada pela chave ATIVA.
//
// Ou seja: o chaveiro abria todo o dado, e o boot morria dizendo "toda chave de
// produto de licença já gravada está ilegível" — afirmação falsa — e mandando
// restaurar uma chave que nada pedia. A saída que a mensagem ensinava era
// impossível (a chave não existia mais) e a correta não estava escrita.
//
// A causa é a inferência: o canário concluía, da própria falha, o estado de todo
// o dado. Agora ele pergunta ao dado.
// ═════════════════════════════════════════════════════════════════════════════

describe('⚠️ o canário escrito por uma chave que sumiu, com TODO dado legível', () => {
  it('deixa o boot seguir em vez de trancar o ambiente', async () => {
    // O canário nasce com a chave A.
    process.env.APP_ENCRYPTION_KEY = CHAVE_A;
    await apagarCanario();
    await verificarCanarioDeCriptografia(NADA_CIFRADO);
    expect(kidDoPacote((await lerCanario())!)).toBe(kidDe(CHAVE_A));

    // A rotação terminou: os valores foram recifrados com a B e a A saiu do
    // ambiente. O que ficou para trás foi só o canário.
    process.env.APP_ENCRYPTION_KEY = CHAVE_B;
    delete process.env.APP_ENCRYPTION_KEYS_ANTIGAS;

    await expect(
      verificarCanarioDeCriptografia(colunaCom(kidDe(CHAVE_B), kidDe(CHAVE_B))),
    ).resolves.toBeUndefined();
  });

  it('e REGRAVA o canário, para o aviso não virar permanente', async () => {
    // Sem a regravação, todo boot seguinte repetiria o mesmo aviso sobre uma
    // chave que ninguém vai trazer de volta — e aviso que sempre aparece é
    // aviso que ninguém lê.
    expect(kidDoPacote((await lerCanario())!)).toBe(kidDe(CHAVE_B));
  });

  it('mas UM valor da chave que sumiu já derruba o boot', async () => {
    // A guarda do D91 continua inteira: o que mudou é quem responde a pergunta,
    // não o rigor dela. Dois valores legíveis não compram passagem para um
    // ilegível.
    process.env.APP_ENCRYPTION_KEY = CHAVE_A;
    await apagarCanario();
    await verificarCanarioDeCriptografia(NADA_CIFRADO);

    process.env.APP_ENCRYPTION_KEY = CHAVE_B;
    delete process.env.APP_ENCRYPTION_KEYS_ANTIGAS;

    await expect(
      verificarCanarioDeCriptografia(colunaCom(kidDe(CHAVE_B), kidDe(CHAVE_A), kidDe(CHAVE_B))),
    ).rejects.toThrow(/1 em tabela\.coluna/);
  });

  it('e `kid` em formato desconhecido conta como ilegível', async () => {
    // Valor que não parece ter saído da nossa cifra é problema de qualquer
    // jeito. Tratá-lo como "tudo bem" seria deixar passar corrupção de dado em
    // nome de não incomodar ninguém.
    process.env.APP_ENCRYPTION_KEY = CHAVE_A;
    await apagarCanario();
    await verificarCanarioDeCriptografia(NADA_CIFRADO);

    process.env.APP_ENCRYPTION_KEY = CHAVE_B;
    delete process.env.APP_ENCRYPTION_KEYS_ANTIGAS;

    await expect(
      verificarCanarioDeCriptografia(colunaCom('formato-desconhecido')),
    ).rejects.toThrow(/formato-desconhecido/);
  });
});

describe('a fiação real: quem responde é licenses.productKey', () => {
  it('lê o kid da chave de produto gravada, e não de outra coluna', async () => {
    const seed = await idsDoSeed();

    // A licença nasce com chave de produto cifrada pela chave DO AMBIENTE de
    // teste — a mesma que o `.env.test` configura.
    restaurarAmbiente();
    const comChave = await criarLicenca(api, {
      name: 'Licença do canário',
      categoryId: seed.categoriaLicencaId,
      seatsTotal: 1,
      productKey: 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE',
    });
    expect(comChave.hasProductKey).toBe(true);

    const ativa = chaveiro().ativa!;
    const [coluna] = colunasCifradasDaLicenca();
    expect(coluna.descricao).toBe('licenses.productKey');

    // O helper devolve o kid da chave ativa, porque foi ela que cifrou. É esta
    // leitura que, em produção, decide se o boot cai ou segue.
    const kids = await coluna.kidsGuardados();
    expect(kids).toContain(ativa.kid);

    // E com o chaveiro trocado por um que não contém essa chave, o boot cai —
    // agora por um motivo verdadeiro, medido no dado.
    await apagarCanario();
    await verificarCanarioDeCriptografia(NADA_CIFRADO);

    process.env.APP_ENCRYPTION_KEY = CHAVE_B;
    delete process.env.APP_ENCRYPTION_KEYS_ANTIGAS;

    await expect(verificarCanarioDeCriptografia(colunasCifradasDaLicenca())).rejects.toThrow(
      /licenses\.productKey/,
    );
  });
});

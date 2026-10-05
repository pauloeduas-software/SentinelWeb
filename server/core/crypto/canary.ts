import { prisma } from '../database/prismaClient';
import { createLogger } from '../logger/logger';
import { chaveiro } from './keyring';
import { cifrarCanario, conferirCanario, kidDoPacote } from './cipher';

const logger = createLogger('crypto.canary');

// O CANÁRIO NO BOOT — a defesa contra a troca silenciosa de chave (D91).
//
// ═════════════════════════════════════════════════════════════════════════════
// O PROBLEMA QUE ELE RESOLVE, E POR QUE ELE PRECISA SER NO BOOT
//
// Trocar `APP_ENCRYPTION_KEY` torna TODA chave de produto já gravada ilegível.
// Sem o canário, o sistema sobe perfeito: as telas abrem, as licenças listam,
// os assentos entregam. A falha só aparece no dia em que alguém clica em
// "revelar chave" — um 500 no meio de uma tela, semanas depois do deploy que
// causou, com a causa a essa altura invisível.
//
// Com ele, o processo NÃO SOBE, e a mensagem diz exatamente o que houve. É a
// mesma escolha do `validateEnv`: falhar cedo e limpo em vez de tarde e
// confuso.
// ═════════════════════════════════════════════════════════════════════════════
//
// POR QUE ELE MORA EM `core/` e não numa `use-case` de `settings`: ele não
// responde nenhuma pergunta de negócio. Ele pergunta "o chaveiro deste processo
// abre o que está gravado neste banco?", que é infraestrutura — e a F9 vai
// depender da mesma resposta sem saber o que é uma licença.

/** A linha única de `app_settings`. O mesmo id que o resto do sistema usa. */
const SINGLETON = 'singleton';

// ═════════════════════════════════════════════════════════════════════════════
// O CANÁRIO PERGUNTA AO DADO ANTES DE DERRUBAR O BOOT
//
// A primeira versão concluía, do canário não conferir, que **toda** chave de
// produto estava ilegível. É uma inferência, e ela erra num caso real e comum:
//
//   1. o canário é gravado com a chave A;
//   2. a chave passa a ser B e os valores cifrados são regravados com B
//      (ou nascem depois, já com B);
//   3. A sai do ambiente, porque nada mais precisa dela.
//
// Aqui o chaveiro abre TUDO o que está gravado — e o boot morria, com uma
// mensagem afirmando o contrário e mandando restaurar uma chave que nenhum dado
// pede. Alarme falso que tranca o ambiente e ensina a coisa errada, que é o
// oposto do que o `docs/referencia/invariantes.md` cobra de uma mensagem.
//
// A correção não afrouxa o D91: quando o canário não confere, o canário deixa de
// ser a resposta e passa a ser a PERGUNTA. Quem responde é o dado — se algum
// valor guardado foi cifrado por uma chave que não está no chaveiro, o boot cai
// (agora dizendo quantos valores e com qual `kid`); se todos abrem, ele segue e
// regrava o canário, aos gritos no log.
//
// POR QUE ISTO ENTRA POR PARÂMETRO: `core` não conhece `domain` (eslint.config.js),
// e onde vivem valores cifrados é conhecimento de negócio. É a mesma inversão do
// `parseListQuery`, que recebe a allowlist de colunas ordenáveis em vez de
// conhecê-la. Hardcodar `licenses."productKey"` aqui criaria uma segunda fonte de
// verdade sobre onde moram os segredos — e ela ficaria desatualizada na F9.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Um lugar onde o sistema guarda valor cifrado.
 *
 * **Coluna nova cifrada tem que entrar nesta lista**, no `server.ts`. Uma que
 * fique de fora não é um detalhe cosmético: se o canário falhar e ela for a
 * única com dado de uma chave perdida, o boot vai concluir "o chaveiro abre
 * tudo" e seguir — e o valor dela só se descobre ilegível quando alguém o pedir.
 * É o mesmo tipo de falha tardia que o canário existe para adiantar.
 */
export interface ColunaCifrada {
  /** `"licenses.productKey"`. Vai para o log e para a mensagem de boot. */
  descricao: string;
  /** Os `kid` de todo valor cifrado guardado ali. Nunca os valores. */
  kidsGuardados(): Promise<string[]>;
}

/** O que está gravado e o chaveiro não abre, por coluna. */
interface Ilegivel {
  descricao: string;
  kidsAusentes: string[];
  quantidade: number;
}

/**
 * Confere se o chaveiro abre o que está REALMENTE gravado.
 *
 * `kid` em formato desconhecido conta como ausente: valor que não parece ter
 * saído desta função é problema de qualquer jeito, e tratá-lo como "tudo bem"
 * seria deixar passar corrupção de dado em nome de não incomodar.
 */
async function conferirOQueEstaGravado(
  colunas: ColunaCifrada[],
  porKid: Map<string, unknown>,
): Promise<Ilegivel[]> {
  const ilegiveis: Ilegivel[] = [];

  for (const coluna of colunas) {
    const kids = await coluna.kidsGuardados();
    const ausentes = kids.filter((kid) => !porKid.has(kid));
    if (ausentes.length > 0) {
      ilegiveis.push({
        descricao: coluna.descricao,
        kidsAusentes: [...new Set(ausentes)].sort(),
        quantidade: ausentes.length,
      });
    }
  }

  return ilegiveis;
}

/**
 * Confere (ou grava) o canário. Lança quando o chaveiro não abre o que existe.
 *
 * QUATRO CAMINHOS, e o último é o único que derruba o boot:
 *
 *   sem chave ativa        → não faz nada. O sistema roda sem criptografia, e
 *                            quem recusa gravar chave de produto é o use-case,
 *                            com 422. Derrubar aqui obrigaria todo ambiente de
 *                            desenvolvimento a configurar uma chave para abrir
 *                            uma tela de ativos.
 *   canário ausente        → grava com a chave ativa. É o primeiro boot depois
 *                            da F6, ou o primeiro com chave configurada.
 *   confere, com kid ANTIGO→ regrava com a ativa. É a rotação terminando: sem
 *                            isto o canário fica preso à chave que o escreveu
 *                            primeiro e a antiga nunca pode sair do ambiente.
 *   canário não confere    → PERGUNTA AO DADO. Valor gravado com chave que não
 *                            está no chaveiro → LANÇA. Nenhum → regrava o
 *                            canário e segue, com aviso alto no log.
 */
export async function verificarCanarioDeCriptografia(
  /**
   * Onde o sistema guarda valor cifrado. Vazio significa "não há nada cifrado
   * neste sistema" — e é isso que o canário vai concluir se o canário falhar,
   * então passar a lista certa não é opcional.
   */
  colunasCifradas: ColunaCifrada[],
): Promise<void> {
  const { ativa, porKid } = chaveiro();

  if (!ativa) {
    logger.warn(
      '[Canário] Sem APP_ENCRYPTION_KEY: chave de produto de licença não pode ser gravada nem lida.',
    );
    return;
  }

  // `findUnique` e não `findFirst`: `app_settings` não tem `deletedAt`, então
  // não há escopo de lixeira a respeitar aqui.
  const setting = await prisma.appSetting.findUnique({
    where: { id: SINGLETON },
    select: { cryptoCanary: true },
  });

  const guardado = setting?.cryptoCanary ?? null;

  if (!guardado) {
    // `upsert` porque a linha pode não existir ainda (banco recém-criado, antes
    // do seed). Gravar o canário é inofensivo e idempotente.
    await prisma.appSetting.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, cryptoCanary: cifrarCanario() },
      update: { cryptoCanary: cifrarCanario() },
    });
    logger.info(`[Canário] Gravado com a chave "${ativa.kid}".`);
    return;
  }

  const problema = conferirCanario(guardado);
  if (!problema) {
    // ── A ROTAÇÃO TERMINA AQUI ──────────────────────────────────────────────
    //
    // O canário conferiu, mas pode ter conferido com uma chave APOSENTADA — a
    // que o escreveu da primeira vez. Sem regravá-lo, ele fica preso àquele
    // `kid` para sempre, e a rotação passa a ter um fim impossível: depois de
    // recifrar todas as chaves de produto com a nova, tirar a antiga do
    // `APP_ENCRYPTION_KEYS_ANTIGAS` derruba o boot — e a mensagem manda pôr a
    // antiga de volta, que é exatamente o contrário de terminar.
    //
    // Regravar com a ativa é o que fecha o ciclo. É seguro porque só acontece
    // depois de o canário ter conferido: este processo PROVOU que abre o que
    // está gravado, então trocar o carimbo não esconde incompatibilidade
    // nenhuma. O que ele deixa de proteger a partir daí é o valor que ainda
    // estiver cifrado com a chave antiga — e disso quem cuida é a própria
    // recifragem, não o canário.
    const kidGravado = kidDoPacote(guardado);
    if (kidGravado !== ativa.kid) {
      await prisma.appSetting.update({
        where: { id: SINGLETON },
        data: { cryptoCanary: cifrarCanario() },
      });
      logger.warn(
        `[Canário] Regravado de "${kidGravado ?? 'formato desconhecido'}" para a chave ativa `
        + `"${ativa.kid}". Se ainda há valor cifrado com a chave anterior, ela precisa continuar `
        + 'em APP_ENCRYPTION_KEYS_ANTIGAS até a recifragem terminar — o canário não acusa mais isso.',
      );
      return;
    }

    logger.info(`[Canário] Conferido. Chave ativa "${ativa.kid}", ${porKid.size} no chaveiro.`);
    return;
  }

  // ── O CANÁRIO NÃO CONFERE. ELE DEIXA DE SER A RESPOSTA E VIRA A PERGUNTA ──
  //
  // Daqui até o fim, a única coisa provada é que o chaveiro não abre o CANÁRIO —
  // que é um valor sem nenhum uso além de ser conferido. Se todo dado de
  // verdade abre, derrubar o boot tranca o ambiente por causa de um sentinela.
  const kidDoCanario = kidDoPacote(guardado) ?? 'formato desconhecido';
  const ilegiveis = await conferirOQueEstaGravado(colunasCifradas, porKid);

  if (ilegiveis.length === 0) {
    // O CHAVEIRO ABRE TUDO O QUE IMPORTA. O canário foi escrito por uma chave
    // que saiu do ambiente depois de os valores já terem sido regravados com a
    // atual — rotação que terminou sem o canário ter acompanhado.
    //
    // Regravar é seguro e é o que impede o aviso de virar permanente. Mas ele
    // sai como WARN e não INFO de propósito: se a chave saiu do ambiente por
    // ACIDENTE e por coincidência não havia valor dela gravado, esta linha é a
    // única pista de que o chaveiro mudou — e ela precisa aparecer.
    await prisma.appSetting.update({
      where: { id: SINGLETON },
      data: { cryptoCanary: cifrarCanario() },
    });

    const inspecionadas = colunasCifradas.length === 0
      ? 'nenhuma coluna cifrada declarada'
      : colunasCifradas.map((coluna) => coluna.descricao).join(', ');

    logger.warn(
      `[Canário] A chave "${kidDoCanario}" que gravou o canário não está mais no chaveiro, `
      + `mas TODO valor cifrado guardado abre com as chaves atuais (${inspecionadas}). `
      + `Canário regravado com a chave ativa "${ativa.kid}". Se a chave "${kidDoCanario}" saiu do `
      + 'ambiente sem intenção, este é o único aviso que você vai receber.',
    );
    return;
  }

  // ── HÁ DADO ILEGÍVEL. AGORA SIM O BOOT CAI ────────────────────────────────
  //
  // A frase diz o que fazer, não só o que houve — é a regra do docs/referencia/invariantes.md:
  // *se a mensagem não ensina o que fazer em seguida, ela ainda não está
  // pronta*. As duas saídas são reais e opostas, e escolher a errada destrói
  // dado, então as duas estão escritas.
  //
  // E ela diz QUANTOS valores e com QUAL `kid`, em vez de "toda chave de produto
  // está ilegível": o número exato é a diferença entre restaurar uma chave e
  // decidir que três linhas de teste podem ser reescritas à mão.
  const detalhe = ilegiveis
    .map((linha) => `${linha.quantidade} em ${linha.descricao} (kid ${linha.kidsAusentes.join(', ')})`)
    .join('; ');

  // `replace` no ponto final: a frase do `CryptoError` já termina em ponto, e
  // concatenar produzia "…do ambiente.. Há valor…".
  throw new Error(
    `Chave de criptografia incompatível com os dados gravados: ${problema.replace(/\.$/, '')}. ` +
      `Há valor cifrado por chave que não está no chaveiro: ${detalhe}. ` +
      'Se a chave foi trocada de propósito, ponha a ANTIGA em APP_ENCRYPTION_KEYS_ANTIGAS ' +
      '(separadas por vírgula) para que os valores existentes continuem legíveis. ' +
      'Se foi troca acidental, restaure o valor anterior de APP_ENCRYPTION_KEY.',
  );
}

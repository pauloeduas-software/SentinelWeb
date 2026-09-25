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
 *   canário não confere    → LANÇA. A chave mudou por baixo do dado gravado.
 */
export async function verificarCanarioDeCriptografia(): Promise<void> {
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

  // A frase diz o que fazer, não só o que houve — é a regra do INVARIANTES.md:
  // *se a mensagem não ensina o que fazer em seguida, ela ainda não está
  // pronta*. As duas saídas são reais e opostas, e escolher a errada destrói
  // dado, então as duas estão escritas.
  // `replace` no ponto final: a frase do `CryptoError` já termina em ponto, e
  // concatenar produzia "…do ambiente.. Toda chave…".
  throw new Error(
    `Chave de criptografia incompatível com os dados gravados: ${problema.replace(/\.$/, '')}. ` +
      'Toda chave de produto de licença já gravada está ilegível com o chaveiro atual. ' +
      'Se a chave foi trocada de propósito, ponha a ANTIGA em APP_ENCRYPTION_KEYS_ANTIGAS ' +
      '(separadas por vírgula) para que os valores existentes continuem legíveis. ' +
      'Se foi troca acidental, restaure o valor anterior de APP_ENCRYPTION_KEY.',
  );
}

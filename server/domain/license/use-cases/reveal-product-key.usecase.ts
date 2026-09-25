import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { CryptoError, decifrar } from '../../../core/crypto/cipher';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { aadDaChave } from '../helpers/license-select.helper';

// A REVELAÇÃO DA CHAVE DE PRODUTO — e o rastro que ela deixa.
//
// ═════════════════════════════════════════════════════════════════════════════
// ESTA É A ÚNICA PORTA. Nenhuma listagem, nenhum detalhe, nenhum export devolve
// `productKey` — a allowlist de `LICENSE_SELECT` e o `paraResposta` garantem
// isso pelo TIPO, não por um `delete` que alguém possa remover.
//
// E ela GRAVA ANTES DE RESPONDER. A ordem importa: o log está na mesma
// transação que a leitura, então não existe caminho em que a chave saia e o
// registro não exista. Gravar depois de responder deixaria a janela em que o
// processo morre entre as duas coisas — e a única prova de quem viu o segredo
// seria justamente a que se perdeu.
// ═════════════════════════════════════════════════════════════════════════════

export interface ChaveRevelada {
  licenseId: string;
  productKey: string;
}

export async function revealProductKey(
  licenseId: string,
  actorId: string | null,
): Promise<ChaveRevelada> {
  return prisma.$transaction(async (tx) => {
    // `findFirst` pelo escopo da lixeira: a chave de uma licença apagada não se
    // revela. Se alguém precisar dela, o caminho é restaurar a licença — que é
    // uma operação registrada.
    const licenca = await tx.license.findFirst({
      where: { id: licenseId },
      select: { id: true, name: true, productKey: true },
    });
    if (!licenca) throw new AppError('Nenhuma licença com este identificador.', 404);

    // 404 e não 200 com `null`: quem chamou esta rota pediu um valor, e um
    // corpo vazio com status de sucesso faria a tela mostrar "chave: —" como se
    // a revelação tivesse acontecido.
    if (!licenca.productKey) {
      throw new AppError(`A licença "${licenca.name}" não tem chave de produto cadastrada.`, 404);
    }

    let chave: string;
    try {
      // O AAD amarra o valor a ESTA linha (D91): uma chave copiada de outra
      // licença por dentro do banco falha aqui, em vez de ser revelada como
      // legítima.
      chave = decifrar(licenca.productKey, aadDaChave(licenseId));
    } catch (erro) {
      // 500 e não 422: o cliente não errou nada. O que mudou foi a configuração
      // do servidor por baixo do dado gravado, e a frase do `CryptoError` já
      // diz qual das causas foi — sem carregar o valor.
      throw new AppError(
        erro instanceof CryptoError
          ? erro.message
          : 'Não foi possível decifrar a chave de produto.',
        500,
      );
    }

    // O LOG, NA MESMA TRANSAÇÃO E ANTES DO RETORNO.
    //
    // `changes` NÃO carrega a chave nem parte dela — seria trocar um segredo
    // cifrado numa coluna por um segredo em claro numa tabela de auditoria, que
    // é lida por mais gente e guarda para sempre. O que ele carrega é quando e
    // por quem, que é o que a pergunta "quem viu esta chave?" precisa.
    await recordActivity(tx, {
      entityType: 'License',
      entityId: licenseId,
      action: 'VIEW_KEY',
      changes: { revealedAt: new Date().toISOString() },
    }, actorId);

    return { licenseId, productKey: chave };
  });
}

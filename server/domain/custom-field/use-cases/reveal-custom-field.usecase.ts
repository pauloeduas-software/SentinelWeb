import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { CryptoError, decifrar, estaCifrado } from '../../../core/crypto/cipher';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { aadDoCampo, lerCampos } from '../helpers/custom-field-value.helper';

// A REVELAÇÃO DE UM CAMPO CIFRADO — e o rastro que ela deixa (F9, Etapa E/D62).
//
// ═════════════════════════════════════════════════════════════════════════════
// ESTA É A ÚNICA PORTA. Nenhuma listagem, nenhum detalhe, nenhuma resposta de
// criação ou edição devolve o valor: `comCamposMascarados()` é a única saída de
// uma linha com `customFields`, e ela troca todo pacote cifrado por `••••••`.
//
// E ELA GRAVA ANTES DE RESPONDER, na mesma transação da leitura. A ordem importa:
// não existe caminho em que o segredo saia e o registro de quem o viu não exista.
// Gravar depois de responder deixaria a janela em que o processo morre entre as
// duas coisas — e a única prova de quem viu seria justamente a que se perdeu.
//
// É o mesmo desenho do `reveal-product-key.usecase.ts` da F6, de propósito: as
// duas respondem à mesma pergunta de auditoria, e duas formas de responder é o
// começo de uma delas estar errada.
// ═════════════════════════════════════════════════════════════════════════════

export interface CampoRevelado {
  assetId: string;
  slug: string;
  value: string;
}

export async function revealCustomField(
  assetId: string,
  slug: string,
  actorId: string | null,
): Promise<CampoRevelado> {
  return prisma.$transaction(async (tx) => {
    // `findFirst` pelo escopo da lixeira: o segredo de um ativo apagado não se
    // revela. Se alguém precisar dele, o caminho é restaurar o ativo — que é uma
    // operação registrada.
    const ativo = await tx.asset.findFirst({
      where: { id: assetId },
      select: { id: true, assetTag: true, customFields: true },
    });
    if (!ativo) throw new AppError('Registro não encontrado', 404);

    const guardado = lerCampos(ativo.customFields)[slug];

    // 404 e não 200 com `null`: quem chamou esta rota pediu um valor, e um corpo
    // vazio com status de sucesso faria a tela mostrar "—" como se a revelação
    // tivesse acontecido e o campo estivesse vazio.
    if (guardado === undefined) {
      throw new AppError(
        `O ativo ${ativo.assetTag} não tem valor gravado no campo "${slug}".`,
        404,
      );
    }

    // ── O CAMPO NÃO É CIFRADO: 422, E A MENSAGEM DIZ ONDE ELE JÁ ESTÁ ───────
    //
    // Devolver o valor aqui seria pior do que parece: esta rota grava
    // `ActivityLog` a cada chamada, então uma tela que a usasse para ler campo
    // comum encheria a trilha de auditoria de linhas que ninguém lê — e afogaria
    // justamente as que importam (é a razão pela qual o `VIEW_KEY` da F6 não
    // virou padrão; ver `record-activity.usecase.ts`).
    if (!estaCifrado(guardado)) {
      throw new AppError(
        `O campo "${slug}" não é cifrado: o valor dele já vem na leitura normal do ativo.`,
        422,
      );
    }

    let valor: string;
    try {
      // O AAD amarra o valor a ESTA linha e a ESTE campo (D81 + `aadDoCampo`):
      // um segredo copiado de outro ativo — ou do campo vizinho do mesmo ativo —
      // falha aqui, em vez de ser revelado como legítimo.
      valor = decifrar(guardado, aadDoCampo(assetId, slug));
    } catch (erro) {
      // 500 e não 422: o cliente não errou nada. O que mudou foi a configuração
      // do servidor por baixo do dado gravado, e a frase do `CryptoError` já diz
      // qual das causas foi — sem carregar o valor.
      throw new AppError(
        erro instanceof CryptoError ? erro.message : 'Não foi possível decifrar o valor do campo.',
        500,
      );
    }

    // O LOG, NA MESMA TRANSAÇÃO E ANTES DO RETORNO.
    //
    // `changes` NÃO carrega o valor nem parte dele — seria trocar um segredo
    // cifrado numa coluna por um segredo em claro numa tabela de auditoria, que é
    // lida por mais gente e guarda para sempre. O que ele carrega é QUAL campo,
    // QUANDO e (pelo `actorId`) QUEM, que é o que a pergunta "quem viu isto?"
    // precisa.
    //
    // `entityType: 'Asset'` e não `'CustomField'`: quem abre a aba Histórico
    // quer ler "alguém viu a senha do BIOS deste notebook". Um log pendurado na
    // definição do campo não apareceria em consulta nenhuma do ativo — é o mesmo
    // motivo do `ATTACH`/`INSTALL` (ver `record-activity.usecase.ts`).
    await recordActivity(tx, {
      entityType: 'Asset',
      entityId: assetId,
      action: 'VIEW_FIELD',
      changes: { slug, revealedAt: new Date().toISOString() },
    }, actorId);

    return { assetId, slug, value: valor };
  });
}

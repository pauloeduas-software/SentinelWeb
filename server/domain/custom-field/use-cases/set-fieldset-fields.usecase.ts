import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { validadorDoFormato } from '../helpers/field-validator.helper';

// A COMPOSIÇÃO DE UM CONJUNTO, GRAVADA DE UMA VEZ.
//
// ═════════════════════════════════════════════════════════════════════════════
// SUBSTITUIÇÃO INTEIRA, E NÃO UM ENDPOINT POR OPERAÇÃO.
//
// A tela é de arrastar-e-soltar: ela já tem a lista inteira, na ordem final, com
// as caixas de obrigatório marcadas. Um `POST /fields`, um `DELETE /fields/:id` e
// um `PATCH /fields/reorder` obrigariam a tela a traduzir um estado em uma
// sequência de operações — e a sequência tem estados intermediários que a
// reordenação não sabe representar sem colidir.
//
// A ORDEM É O ÍNDICE DO ARRAY, e é aqui que a decisão de `ordem` NÃO ser único
// (ver o schema) se paga: reordenar cinco vínculos é cinco `update` dentro de uma
// transação, e com `@@unique([fieldsetId, ordem])` o segundo `update` colidiria
// com o primeiro no meio do caminho, porque constraint do Postgres é IMEDIATA e
// o Prisma não expressa `DEFERRABLE`.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Teto de campos num conjunto.
 *
 * Não é número redondo por acaso: o conjunto resolvido viaja INTEIRO em toda
 * abertura do formulário de ativo, com `listValues` de cada campo, e cada campo é
 * uma chave a mais no JsonB de cada ativo. Cinquenta é mais do que qualquer
 * formulário que alguém consiga preencher.
 */
export const MAX_CAMPOS_POR_CONJUNTO = 50;

export interface VinculoDesejado {
  fieldId: string;
  required: boolean;
  defaultValue: string | null;
}

export async function setFieldsetFields(
  fieldsetId: string,
  desejados: VinculoDesejado[],
  actorId: string | null,
): Promise<void> {
  if (desejados.length > MAX_CAMPOS_POR_CONJUNTO) {
    throw new AppError(`Máximo de ${MAX_CAMPOS_POR_CONJUNTO} campos por conjunto.`, 422);
  }

  const repetidos = desejados.length - new Set(desejados.map((v) => v.fieldId)).size;
  if (repetidos > 0) {
    // 422 e não "deduplicar em silêncio": o mesmo campo duas vezes no conjunto é
    // sinal de que a tela perdeu o estado, e engolir o erro esconderia isso.
    throw new AppError('O mesmo campo aparece mais de uma vez no conjunto.', 422);
  }

  await prisma.$transaction(async (tx) => {
    const conjunto = await tx.customFieldset.findUnique({
      where: { id: fieldsetId },
      select: { id: true, name: true },
    });
    if (!conjunto) throw new AppError('Registro não encontrado', 404);

    // Os campos, para validar o `defaultValue` contra o formato de cada um.
    const campos = await tx.customField.findMany({
      where: { id: { in: desejados.map((v) => v.fieldId) } },
      select: {
        id: true, slug: true, name: true, element: true, format: true,
        regexPattern: true, listValues: true, encrypted: true,
      },
    });
    const porId = new Map(campos.map((campo) => [campo.id, campo]));

    const inexistentes = desejados.filter((v) => !porId.has(v.fieldId)).map((v) => v.fieldId);
    if (inexistentes.length > 0) {
      // Antes do FK, para a mensagem dizer QUAL campo: o P2003 do banco viraria
      // um 409 genérico "Registro está em uso por outro cadastro", que aqui não
      // descreve nada do que aconteceu.
      throw new AppError(`Campo customizado inexistente: ${inexistentes.join(', ')}.`, 422);
    }

    // ── O `defaultValue` É VALIDADO AQUI, E ISSO NÃO É ZELO ─────────────────
    //
    // Ele entra na criação de todo ativo do conjunto (`validarCamposCustomizados`
    // com `criando: true`). Um padrão inválido gravado aqui faria a criação de
    // ativo responder 422 mais tarde, apontando um campo que quem cadastra o
    // ativo não configurou e não pode corrigir — o erro apareceria na tela errada,
    // para a pessoa errada.
    //
    // Validar no cadastro do conjunto põe a mensagem onde o erro foi cometido.
    for (const desejado of desejados) {
      if (desejado.defaultValue === null) continue;
      const campo = porId.get(desejado.fieldId)!;

      // Campo cifrado não tem valor padrão: o padrão fica em claro nesta tabela,
      // e um segredo pré-preenchido igual em toda máquina não é segredo.
      if (campo.encrypted) {
        throw new AppError(
          `O campo "${campo.name}" é cifrado e não pode ter valor padrão: `
          + 'o padrão ficaria em claro no cadastro do conjunto.',
          422,
          { fields: { [campo.slug]: 'campo cifrado não aceita valor padrão' } },
        );
      }

      const problema = validadorDoFormato(campo, campo.name).safeParse(desejado.defaultValue);
      if (!problema.success) {
        throw new AppError(
          `Valor padrão inválido para "${campo.name}": ${problema.error.issues[0]?.message ?? 'formato não aceito'}`,
          422,
          { fields: { [campo.slug]: problema.error.issues[0]?.message ?? 'valor padrão inválido' } },
        );
      }
    }

    const antes = await tx.customFieldsetField.findMany({
      where: { fieldsetId },
      orderBy: [{ ordem: 'asc' }, { fieldId: 'asc' }],
      select: { fieldId: true, required: true, defaultValue: true, field: { select: { slug: true } } },
    });

    // ── APAGA O QUE SAIU, `upsert` NO RESTO ────────────────────────────────
    //
    // `deleteMany` + `createMany` seria mais curto e perderia `createdAt` de todo
    // vínculo que continua no conjunto — a data em que aquele campo passou a ser
    // pedido, que é justamente o que se olha ao investigar por que um ativo antigo
    // não tem valor nele.
    const desejadosIds = new Set(desejados.map((v) => v.fieldId));
    const removidos = antes.filter((v) => !desejadosIds.has(v.fieldId));

    if (removidos.length > 0) {
      await tx.customFieldsetField.deleteMany({
        where: { fieldsetId, fieldId: { in: removidos.map((v) => v.fieldId) } },
      });
    }

    for (const [indice, desejado] of desejados.entries()) {
      await tx.customFieldsetField.upsert({
        where: { fieldsetId_fieldId: { fieldsetId, fieldId: desejado.fieldId } },
        create: {
          fieldsetId,
          fieldId: desejado.fieldId,
          ordem: indice,
          required: desejado.required,
          defaultValue: desejado.defaultValue,
        },
        update: {
          ordem: indice,
          required: desejado.required,
          defaultValue: desejado.defaultValue,
        },
      });
    }

    // ── O LOG, PELO `slug` E NÃO PELO `fieldId` ────────────────────────────
    //
    // Quem lê o histórico de um conjunto meses depois quer ver "ip_fixo passou a
    // ser obrigatório", não um uuid — e o uuid pode já não existir, porque apagar
    // o campo é uma operação permitida depois de ele sair de todos os conjuntos.
    const retratoAntes = antes.map((v) => ({
      slug: v.field.slug, required: v.required, defaultValue: v.defaultValue,
    }));
    const retratoDepois = desejados.map((v) => {
      const campo = porId.get(v.fieldId)!;
      return { slug: campo.slug, required: v.required, defaultValue: v.defaultValue };
    });

    // Nada mudou, nada se registra: a tela de arrastar-e-soltar salva com
    // frequência, e gravar uma linha por salvamento sem alteração encheria o
    // histórico do conjunto de ruído.
    //
    // A comparação é ESTRUTURAL (os objetos), e não sobre o texto que vai para o
    // log: dois retratos diferentes podem render o mesmo texto num caso
    // patológico — um `defaultValue` que contenha a própria pontuação do formato
    // —, e aí a mudança deixaria de ser registrada.
    if (JSON.stringify(retratoAntes) === JSON.stringify(retratoDepois)) return;

    await recordActivity(tx, {
      entityType: 'CustomFieldset',
      entityId: fieldsetId,
      action: 'UPDATE',
      changes: { campos: { de: emUmaLinha(retratoAntes), para: emUmaLinha(retratoDepois) } },
    }, actorId);
  });
}

/**
 * A composição como UMA LINHA DE TEXTO, para o `changes`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * TEXTO, E NÃO O ARRAY DE OBJETOS — é a lição do item 4.4 do fechamento da F9.
 *
 * O leitor genérico do histórico (`src/pages/helpers/historico.helper.ts`) separa
 * mudança de detalhe pela FORMA do valor: `{ de, para }` é mudança, o resto é
 * detalhe. Ele então imprime cada lado com `valorLegivel`, que é `String(valor)`
 * — e `String` de um array de objetos é `[object Object],[object Object]`.
 *
 * Um `{ de: [...], para: [...] }` passa pelo teste de forma e falha na impressão:
 * é exatamente o defeito que os campos do ativo tiveram e que o prefixo `cf.`
 * resolveu lá. Nenhuma tela mostra histórico de conjunto HOJE, e é justamente por
 * isso que isto precisa estar certo agora: a primeira que mostrar não vai
 * desconfiar da forma do dado.
 *
 * A ORDEM do texto é a ordem da composição — é ela que se edita arrastando, e um
 * diff que não a mostrasse esconderia metade do que a tela faz.
 * ═════════════════════════════════════════════════════════════════════════════
 */
function emUmaLinha(
  vinculos: { slug: string; required: boolean; defaultValue: string | null }[],
): string {
  // `(vazio)` e não `''`: o `valorLegivel` troca string vazia por travessão, e
  // "esvaziei o conjunto" ficaria indistinguível de "este lado não tem dado".
  if (vinculos.length === 0) return '(vazio)';

  return vinculos.map((vinculo) => {
    const marcas = [
      vinculo.required ? 'obrigatório' : null,
      vinculo.defaultValue !== null ? `padrão "${vinculo.defaultValue}"` : null,
    ].filter((marca): marca is string => marca !== null);

    return marcas.length > 0 ? `${vinculo.slug} (${marcas.join(', ')})` : vinculo.slug;
  }).join(', ');
}

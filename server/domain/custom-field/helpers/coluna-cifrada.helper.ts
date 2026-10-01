import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { kidDoPacote } from '../../../core/crypto/cipher';
import type { ColunaCifrada } from '../../../core/crypto/canary';
import { lerCampos } from './custom-field-value.helper';

// ONDE ESTE DOMÍNIO GUARDA VALOR CIFRADO — a resposta que o canário do boot faz.
//
// ═════════════════════════════════════════════════════════════════════════════
// SEM ESTE ARQUIVO, O CANÁRIO CONCLUI QUE OS CAMPOS CIFRADOS NÃO EXISTEM.
//
// Quando o canário não confere, ele deixa de ser a resposta e passa a ser a
// PERGUNTA: *existe valor gravado por uma chave que saiu do ambiente?* Quem
// responde é o dado, e o `server.ts` passa a lista dos lugares onde ele mora.
//
// Uma coluna que fique de fora faz o boot concluir "o chaveiro abre tudo" quando
// não abre — e o valor dela só se descobre ilegível quando alguém o pedir, que é
// exatamente a falha tardia que o D91 existe para adiantar. O `canary.ts` já
// avisava, em comentário, que *"a F9 vem com uma"*: é esta.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `assets.customFields` — os campos customizados marcados como cifrados (D62).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * A CONSULTA É CRUA, E O MOTIVO É O MESMO DO `countAssetsWithField`.
 *
 * O `kid` está DENTRO de cada valor do JsonB, então não há como perguntá-lo ao
 * Postgres sem trazer o valor. O que se pode fazer é não trazer o que
 * certamente não tem segredo: `@>`/`?` não ajudam aqui (a pergunta não é por
 * chave conhecida), mas um `LIKE '%enc:v1:%'` sobre o texto da coluna descarta,
 * no banco, toda linha sem nenhum valor cifrado — que é a esmagadora maioria.
 *
 * Sem esse recorte, o boot de um sistema com 50 mil ativos carregaria 50 mil
 * objetos JsonB na memória do processo para achar os três que têm segredo. O
 * canário roda ANTES de a porta abrir, então esse custo é tempo de indisponibi-
 * lidade a cada deploy.
 *
 * Ele NUNCA devolve valores, só `kid`: esta lista vai para o log e para a
 * mensagem de boot. O `kid` é rótulo público de propósito — ele viaja em claro
 * dentro do pacote exatamente para poder ser lido sem chave nenhuma.
 *
 * E não filtra a lixeira: **o ativo excluído também tem campo cifrado**. Ele pode
 * ser restaurado, e um segredo que ninguém consegue mais decifrar não deixa de
 * ser um problema por estar na lixeira.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export function colunasCifradasDoAtivo(): ColunaCifrada[] {
  return [
    {
      descricao: 'assets.customFields',
      async kidsGuardados() {
        const linhas = await prisma.$queryRaw<{ customFields: Prisma.JsonValue }[]>(
          Prisma.sql`
            SELECT "customFields"
              FROM "assets"
             WHERE "customFields" IS NOT NULL
               AND "customFields"::text LIKE '%enc:v1:%'
          `,
        );

        const kids: string[] = [];
        for (const linha of linhas) {
          for (const valor of Object.values(lerCampos(linha.customFields))) {
            // `kidDoPacote` devolve `null` para o que não é pacote desta função
            // — os valores comuns que convivem no mesmo JsonB. Eles não entram.
            const kid = kidDoPacote(valor);
            if (kid) kids.push(kid);
          }
        }

        return kids;
      },
    },
  ];
}

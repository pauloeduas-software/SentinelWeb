import { prisma } from '../../../core/database/prismaClient';
import { kidDoPacote } from '../../../core/crypto/cipher';
import type { ColunaCifrada } from '../../../core/crypto/canary';

// ONDE ESTE DOMÍNIO GUARDA VALOR CIFRADO — a resposta que o canário do boot faz.
//
// ═════════════════════════════════════════════════════════════════════════════
// O canário vive em `core/` e não pode conhecer `domain/` (eslint.config.js), mas
// quando ele falha a pergunta que importa é de negócio: *existe valor gravado por
// uma chave que saiu do ambiente?* Então ele recebe a lista por parâmetro, e é
// este arquivo que a monta — a mesma inversão do `parseListQuery`, que recebe a
// allowlist de colunas ordenáveis em vez de conhecê-la.
//
// **Coluna nova cifrada entra aqui, e o `server.ts` a passa adiante.** Uma que
// fique de fora faz o canário concluir "o chaveiro abre tudo" quando não abre, e
// o valor dela só se descobre ilegível quando alguém o pedir — a falha tardia que
// o D91 existe para adiantar.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `licenses.productKey` — a chave de produto da F6, hoje o único valor cifrado
 * em repouso no sistema.
 *
 * Lê só a coluna cifrada e devolve só os `kid`, nunca os valores: esta lista vai
 * para o log e para a mensagem de boot. O `kid` é rótulo público de propósito —
 * ele viaja em claro dentro do pacote exatamente para poder ser lido sem chave.
 *
 * `findMany` sem filtro de lixeira porque **a licença excluída também tem chave
 * cifrada**: ela pode ser restaurada, e uma chave que ninguém consegue mais
 * decifrar não deixa de ser um problema por estar na lixeira. É o caso em que
 * ignorar o escopo é o certo, e por isso está escrito.
 */
export function colunasCifradasDaLicenca(): ColunaCifrada[] {
  return [
    {
      descricao: 'licenses.productKey',
      async kidsGuardados() {
        const linhas = await prisma.license.findMany({
          where: { productKey: { not: null } },
          select: { productKey: true },
        });

        return linhas
          .map((linha) => kidDoPacote(linha.productKey!) ?? 'formato-desconhecido')
          .filter((kid): kid is string => kid.length > 0);
      },
    },
  ];
}

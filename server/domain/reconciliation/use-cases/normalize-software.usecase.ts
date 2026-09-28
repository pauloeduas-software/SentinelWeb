import { prisma } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';
import { hashDaListaDeSoftware, normalizarListaDeSoftware } from '../helpers/software-key.helper';

const logger = createLogger('reconciliation.software');

// O JSON DO HANDSHAKE VIRA TABELA — e só quando ele muda.
//
// **A regra que justifica o arquivo:** a lista só é re-normalizada quando o
// `softwareHash` difere do `softwareNormalizedHash`. Diferenciar 800 linhas de
// software a cada mensagem de 500 máquinas é o caminho mais curto para derrubar
// o banco — e, como o hash é calculado no handshake, a máquina que não mudou
// nada custa uma comparação de string.

export interface ResultadoDaNormalizacao {
  pacotesNovos: number;
  instalacoesNovas: number;
  removidas: number;
}

/**
 * Normaliza o software de UMA máquina.
 *
 * Três escritas, nesta ordem e por uma razão cada:
 *
 * 1. **Os pacotes que faltam no catálogo.** `skipDuplicates` porque duas
 *    máquinas normalizadas em paralelo trazem os mesmos pacotes — e o índice
 *    único da `normalizedKey` recusaria o segundo.
 * 2. **As instalações.** `upsert` por (máquina, pacote): quem já estava ganha
 *    `lastSeenAt` novo e perde o `removedAt` — reinstalar é voltar, não criar
 *    uma segunda linha.
 * 3. **As que sumiram da lista.** `removedAt` preenchido, nunca `delete`: é a
 *    mesma regra do `Assignment` e do `LicenseSeatCheckout` — "o Photoshop
 *    esteve instalado nesta máquina até junho" é a resposta que a auditoria de
 *    fornecedor vem procurar, e o `delete` a apagaria.
 */
export async function normalizarSoftwareDoEndpoint(endpointId: string): Promise<ResultadoDaNormalizacao> {
  const endpoint = await prisma.endpoint.findUnique({
    where: { id: endpointId },
    select: { id: true, installedSoftware: true, softwareHash: true, softwareNormalizedHash: true },
  });

  const vazio = { pacotesNovos: 0, instalacoesNovas: 0, removidas: 0 };
  if (!endpoint) return vazio;
  if (endpoint.softwareHash && endpoint.softwareHash === endpoint.softwareNormalizedHash) return vazio;

  const pacotes = normalizarListaDeSoftware(endpoint.installedSoftware);
  const hash = hashDaListaDeSoftware(pacotes);

  // Lista vazia não apaga instalação nenhuma: agente que parou de coletar
  // software (versão antiga, coleta falhou) mandaria uma lista vazia, e tratar
  // isso como "desinstalaram tudo" marcaria a máquina inteira como limpa — e a
  // conformidade passaria a dizer que ninguém usa nada.
  if (pacotes.length === 0) {
    await prisma.endpoint.update({ where: { id: endpointId }, data: { softwareNormalizedHash: hash } });
    return vazio;
  }

  const chaves = pacotes.map((pacote) => pacote.normalizedKey);

  const existentes = await prisma.softwarePackage.findMany({
    where: { normalizedKey: { in: chaves } },
    select: { id: true, normalizedKey: true },
  });
  const idPorChave = new Map(existentes.map((pacote) => [pacote.normalizedKey, pacote.id]));

  const faltando = pacotes.filter((pacote) => !idPorChave.has(pacote.normalizedKey));
  if (faltando.length > 0) {
    await prisma.softwarePackage.createMany({ data: faltando, skipDuplicates: true });
    const criados = await prisma.softwarePackage.findMany({
      where: { normalizedKey: { in: faltando.map((pacote) => pacote.normalizedKey) } },
      select: { id: true, normalizedKey: true },
    });
    for (const pacote of criados) idPorChave.set(pacote.normalizedKey, pacote.id);
  }

  const agora = new Date();
  let instalacoesNovas = 0;

  for (const chave of chaves) {
    const packageId = idPorChave.get(chave);
    if (!packageId) continue;

    const resultado = await prisma.softwareInstallation.upsert({
      where: { endpointId_packageId: { endpointId, packageId } },
      update: { lastSeenAt: agora, removedAt: null },
      create: { endpointId, packageId, firstSeenAt: agora, lastSeenAt: agora },
      select: { firstSeenAt: true },
    });
    if (resultado.firstSeenAt.getTime() === agora.getTime()) instalacoesNovas += 1;
  }

  const idsPresentes = chaves.map((chave) => idPorChave.get(chave)).filter((id): id is string => !!id);
  const { count: removidas } = await prisma.softwareInstallation.updateMany({
    where: { endpointId, removedAt: null, packageId: { notIn: idsPresentes } },
    data: { removedAt: agora },
  });

  await prisma.endpoint.update({
    where: { id: endpointId },
    data: { softwareNormalizedHash: hash, softwareHash: endpoint.softwareHash ?? hash },
  });

  return { pacotesNovos: faltando.length, instalacoesNovas, removidas };
}

/**
 * Normaliza quem mudou — a varredura do job.
 *
 * A consulta é a comparação das duas colunas de hash, e ela é o que torna a
 * rodada barata numa frota estável: no dia em que ninguém instalou nada, ela
 * devolve zero linhas.
 */
export async function normalizarSoftwarePendente(): Promise<number> {
  const pendentes = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "endpoints"
     WHERE "mergedIntoId" IS NULL
       AND "softwareHash" IS NOT NULL
       AND ("softwareNormalizedHash" IS NULL OR "softwareNormalizedHash" <> "softwareHash")
  `;

  let normalizados = 0;
  for (const endpoint of pendentes) {
    try {
      await normalizarSoftwareDoEndpoint(endpoint.id);
      normalizados += 1;
    } catch (error) {
      logger.error(`[Software] Falha ao normalizar ${endpoint.id}:`, error);
    }
  }

  if (normalizados > 0) logger.info(`[Software] ${normalizados} máquina(s) com inventário de software atualizado.`);
  return normalizados;
}

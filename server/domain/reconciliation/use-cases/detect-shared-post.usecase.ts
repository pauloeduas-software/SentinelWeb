import { prisma } from '../../../core/database/prismaClient';
import {
  chavesIgnoradas, lerConfiguracaoDaDescoberta, type ConfiguracaoDaDescoberta,
} from '../helpers/discovery-settings.helper';
import { proporSugestao } from './upsert-suggestion.usecase';
import { recorrentes, resumirObservacoes, type PresencaObservada } from './summarize-observations.usecase';

// ═════════════════════════════════════════════════════════════════════════════
// DUAS PESSOAS NA MESMA MÁQUINA É **EVIDÊNCIA DE POSTO COMPARTILHADO** — o D48.
//
// Num modelo `Asset ⟷ User`, esta observação é uma CONTRADIÇÃO: o software
// precisa escolher um vencedor, escolher errado toda semana faz o vínculo
// oscilar, e o jeito de não oscilar é descartar a observação. É por isso que
// todo ITAM de prateleira trata isto como ruído — não falta dado, falta ONDE
// GUARDAR.
//
// Com as três camadas do MODELO-POSSE.md a mesma observação é consistente: o
// ativo é do posto (uma `Assignment`), as pessoas são ocupantes (duas linhas de
// `LocationOccupant`) e o turno é um rótulo no vínculo pessoa↔posto. Não há
// contradição para resolver, então não há nada para descartar.
//
// O LIMITE, DECLARADO: é sugestão. Duas pessoas numa máquina também podem ser um
// técnico de TI dando suporte ou uma conta de serviço — por isso a allowlist do
// D101 filtra antes, e por isso a evidência (quais dias, quais horas, quantas
// amostras) vai visível para a tela. O auto-provisionamento NUNCA cria ocupação
// sozinho, em nenhum modo.
// ═════════════════════════════════════════════════════════════════════════════

/** A pessoa, como ela é gravada na evidência e lida de volta no aceite. */
export interface PessoaDaEvidencia {
  userId: string;
  nome: string;
  conta: string;
  dias: number;
  turno: string | null;
}

function pessoaDaEvidencia(presenca: PresencaObservada, nome: string): PessoaDaEvidencia {
  return {
    userId: presenca.userId!,
    nome,
    conta: presenca.userKey,
    dias: presenca.dias,
    turno: presenca.turnoSugerido,
  };
}

/**
 * Lê de volta as pessoas gravadas na evidência.
 *
 * **POR QUE O ACEITE USA A EVIDÊNCIA, E NÃO UMA CONSULTA NOVA:** quem aceitou
 * viu uma lista de nomes na tela e concordou com AQUELA lista. Recalcular no
 * aceite poderia abrir ocupação para uma terceira pessoa que apareceu ontem e
 * que ninguém aprovou — e o operador descobriria depois, na tela do posto. A
 * evidência é o que foi mostrado; o aceite é sobre o que foi mostrado.
 *
 * O preço é que a lista pode ter envelhecido, e ele é pago pelo
 * `addLocationOccupant`, que recusa pessoa inexistente ou excluída com 404.
 */
export function pessoasDaEvidencia(evidencia: unknown): PessoaDaEvidencia[] {
  if (!evidencia || typeof evidencia !== 'object') return [];
  const pessoas = (evidencia as { pessoas?: unknown }).pessoas;
  if (!Array.isArray(pessoas)) return [];

  return pessoas.filter((pessoa): pessoa is PessoaDaEvidencia =>
    !!pessoa && typeof pessoa === 'object'
    && typeof (pessoa as PessoaDaEvidencia).userId === 'string'
    && typeof (pessoa as PessoaDaEvidencia).conta === 'string');
}

/**
 * Procura posto compartilhado numa máquina vinculada.
 *
 * Dois caminhos, e a diferença entre eles é o D47 outra vez:
 *
 * - **o ativo JÁ é de um posto** → o cadastro está certo e só falta gente nele:
 *   nascem sugestões de `OCCUPANCY`, uma por ocupante que falta;
 * - **o ativo é de uma pessoa, ou de ninguém** → nasce UMA sugestão de
 *   `SHARED_POST`, que propõe mover a posse para o posto e abrir as ocupações.
 */
export async function detectarPostoCompartilhado(
  endpointId: string,
  /**
   * A configuração da RODADA. O job a lê uma vez e passa adiante: o
   * `lerConfiguracao` faz `upsert`, então uma chamada por endpoint era uma
   * ESCRITA por endpoint na linha única do singleton, de hora em hora.
   */
  configuracaoDaRodada?: ConfiguracaoDaDescoberta,
): Promise<number> {
  const endpoint = await prisma.endpoint.findUnique({
    where: { id: endpointId },
    select: { id: true, hostname: true, assetId: true, mergedIntoId: true },
  });
  if (!endpoint?.assetId || endpoint.mergedIntoId) return 0;

  const configuracao = configuracaoDaRodada ?? (await lerConfiguracaoDaDescoberta());
  const presencas = recorrentes(await resumirObservacoes(endpointId, chavesIgnoradas(configuracao), configuracao.timezone));

  // UMA pessoa recorrente é o caso do `suggest-posse` (D47), não deste arquivo.
  if (presencas.length < 2) return 0;

  // Só quem o cadastro conhece pode virar ocupante. As contas não identificadas
  // continuam na evidência — é assim que quem lê a tela descobre que existe uma
  // conta de serviço para pôr na allowlist.
  const identificadas = presencas.filter((presenca) => presenca.userId);
  if (identificadas.length < 2) return 0;

  const pessoas = await prisma.user.findMany({
    where: { id: { in: identificadas.map((presenca) => presenca.userId!) } },
    select: { id: true, name: true },
  });
  const nomePorId = new Map(pessoas.map((pessoa) => [pessoa.id, pessoa.name]));

  const naEvidencia = identificadas
    .filter((presenca) => nomePorId.has(presenca.userId!))
    .map((presenca) => pessoaDaEvidencia(presenca, nomePorId.get(presenca.userId!)!));
  if (naEvidencia.length < 2) return 0;

  const posse = await prisma.assignment.findFirst({
    where: { assetId: endpoint.assetId, checkinAt: null },
    select: { targetType: true, targetLocationId: true },
  });
  if (posse?.targetType === 'ASSET') return 0;

  const contasNaoIdentificadas = presencas
    .filter((presenca) => !presenca.userId)
    .map((presenca) => presenca.userKey);

  // ── O ativo JÁ é do posto: faltam ocupantes, não falta o posto ────────────
  if (posse?.targetType === 'LOCATION' && posse.targetLocationId) {
    const jaOcupam = await prisma.locationOccupant.findMany({
      where: {
        locationId: posse.targetLocationId,
        userId: { in: naEvidencia.map((pessoa) => pessoa.userId) },
        endedAt: null,
      },
      select: { userId: true },
    });
    const cadastrados = new Set(jaOcupam.map((ocupacao) => ocupacao.userId));

    let criadas = 0;
    for (const pessoa of naEvidencia) {
      if (cadastrados.has(pessoa.userId)) continue;

      await proporSugestao({
        kind: 'OCCUPANCY',
        endpointId,
        assetId: endpoint.assetId,
        targetUserId: pessoa.userId,
        targetLocationId: posse.targetLocationId,
        score: 85,
        shift: pessoa.turno,
        evidence: {
          motivo: 'Máquina compartilhada: o ativo já é do posto e esta pessoa trabalha nele.',
          conta: pessoa.conta,
          dias: pessoa.dias,
          turnoInferido: pessoa.turno,
          outrosUsuarios: naEvidencia.filter((outra) => outra.userId !== pessoa.userId).map((outra) => outra.nome),
          contasNaoIdentificadas,
          hostname: endpoint.hostname,
        },
        // Sem `dias` e sem `outrosUsuarios`: os dois mudam a cada rodada, e a
        // afirmação ("esta pessoa trabalha neste posto") não muda com eles.
        afirmacao: { conta: pessoa.conta, userId: pessoa.userId, locationId: posse.targetLocationId },
      });
      criadas += 1;
    }
    return criadas;
  }

  // ── O ativo é de uma pessoa, ou de ninguém: PROMOVER a posto ──────────────
  //
  // O posto proposto é a localização ONDE o ativo está, e só quando ela já foi
  // marcada como posto de trabalho. Fora disso a sugestão vai sem posto e quem
  // aceita escolhe: inventar uma `Location` nova automaticamente encheria a
  // árvore de locais de "Mesa da máquina PC-ANA".
  const ativo = await prisma.asset.findFirst({
    where: { id: endpoint.assetId },
    select: { id: true, assetTag: true, name: true, location: { select: { id: true, name: true, isWorkstation: true } } },
  });

  const postoProposto = ativo?.location?.isWorkstation ? ativo.location : null;

  await proporSugestao({
    kind: 'SHARED_POST',
    endpointId,
    assetId: endpoint.assetId,
    targetLocationId: postoProposto?.id ?? null,
    score: 80,
    shift: null,
    evidence: {
      motivo: posse?.targetType === 'USER'
        ? 'Duas ou mais pessoas usam esta máquina em turnos: ela é de um posto, não de uma pessoa.'
        : 'Duas ou mais pessoas usam esta máquina em turnos, e ela não está entregue a ninguém.',
      pessoas: naEvidencia,
      contasNaoIdentificadas,
      postoProposto: postoProposto?.name ?? null,
      posseAtual: posse?.targetType ?? null,
      hostname: endpoint.hostname,
    },
    // QUEM são as pessoas, ordenado — e é só isso. Uma TERCEIRA pessoa
    // aparecendo muda a afirmação e deve reoferecer mesmo depois de uma recusa:
    // "a Laura e a Ana dividem esta máquina" e "a Laura, a Ana e o Bruno dividem
    // esta máquina" são propostas diferentes de cadastro. Um dia a mais de
    // presença das mesmas duas, não.
    afirmacao: {
      pessoas: naEvidencia.map((pessoa) => pessoa.userId).sort(),
      postoProposto: postoProposto?.id ?? null,
    },
  });

  return 1;
}

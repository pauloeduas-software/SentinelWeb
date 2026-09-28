import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import {
  casarEndpointComAtivos, casarEndpointComEndpoints, PONTOS_PARA_VINCULO_AUTOMATICO,
  type ResultadoDaCascata,
} from '../helpers/match-cascade.helper';
import { normalizeSerial, normalizeUuid } from '../helpers/normalize-identity.helper';
import { proporSugestao } from './upsert-suggestion.usecase';
import { vincularEndpointAoAtivo } from './link-endpoint-asset.usecase';
import {
  lerConfiguracaoDaDescoberta, type ConfiguracaoDaDescoberta,
} from '../helpers/discovery-settings.helper';

// PARA CADA MÁQUINA SEM VÍNCULO, QUAL ATIVO ELA É — e o que fazer com a resposta.
//
// É o único lugar da fase que enxerga o banco E decide: a cascata (pura) diz o
// que casou, este arquivo diz o que isso vira. A separação existe porque a
// pontuação vai mudar com dado real e a regra do que é confiável não deveria
// mudar junto.

const SELECT_IDENTIDADE = {
  id: true,
  hwid: true,
  hostname: true,
  biosSerial: true,
  systemUuid: true,
  macAddress: true,
  assetId: true,
} as const;

/**
 * Os valores de identidade que se repetem ENTRE MÁQUINAS.
 *
 * A lista estática do `normalize-identity.helper` cobre os textos conhecidos
 * (`To Be Filled By O.E.M.` e companhia), e ela nunca vai cobrir todos: cada
 * fabricante inventa o seu. Quem descobre o resto é o próprio parque — um
 * serial que aparece em três máquinas não identifica nenhuma delas,
 * independentemente do que esteja escrito nele.
 *
 * Uma consulta para o parque inteiro, não uma por endpoint: com 500 máquinas a
 * segunda forma seria 500 varreduras para responder a mesma pergunta.
 */
export async function valoresRepetidosNoParque(): Promise<Set<string>> {
  const endpoints = await prisma.endpoint.findMany({
    where: { mergedIntoId: null },
    select: { biosSerial: true, systemUuid: true },
  });

  const contagem = new Map<string, number>();
  for (const endpoint of endpoints) {
    for (const valor of [normalizeSerial(endpoint.biosSerial), normalizeUuid(endpoint.systemUuid)]) {
      if (valor) contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
    }
  }

  const repetidos = new Set<string>();
  for (const [valor, vezes] of contagem) if (vezes > 1) repetidos.add(valor);
  return repetidos;
}

export interface ResultadoDoMatch {
  sugeridas: number;
  vinculadas: number;
  colisoes: number;
}

/**
 * Roda a cascata para UM endpoint e transforma o resultado em fila (ou em
 * vínculo, quando o modo permite).
 *
 * **O vínculo automático exige as três coisas juntas:** `discoveryMode = ON`,
 * 100 pontos e **um único** candidato. Duas sugestões de 100 pontos para o mesmo
 * endpoint não viram vínculo nenhum — é o D46 outra vez: com dois candidatos
 * perfeitos, o que existe é um problema de cadastro, não uma resposta.
 *
 * `repetidos` e `configuracaoDaRodada` são as duas coisas que valem para a
 * RODADA INTEIRA e não para uma máquina: o job as lê uma vez e passa adiante.
 * Sem isso, cada endpoint pendente custava uma varredura do parque e uma ida ao
 * singleton de configuração — 500 máquinas eram 1.000 consultas para responder
 * duas perguntas. Os dois são opcionais para quem chama de fora do job (a rota
 * de uma máquina só), e aí a resposta é a mesma, só mais caro uma vez.
 */
export async function reconciliarEndpoint(
  endpointId: string,
  repetidos?: Set<string>,
  configuracaoDaRodada?: ConfiguracaoDaDescoberta,
): Promise<ResultadoDoMatch> {
  const endpoint = await prisma.endpoint.findUnique({ where: { id: endpointId }, select: SELECT_IDENTIDADE });
  if (!endpoint) throw new AppError('Máquina não encontrada.', 404);

  // Já vinculada: não há o que reconciliar. Quem mexe num vínculo existente é o
  // `unlink` (humano) ou o merge — nunca o job.
  if (endpoint.assetId) return { sugeridas: 0, vinculadas: 0, colisoes: 0 };

  const configuracao = configuracaoDaRodada ?? (await lerConfiguracaoDaDescoberta());

  // ── `OFF` DESLIGA A DESCOBERTA, e isso não era verdade até o D112 ─────────
  //
  // O enum tem três valores e só `ON` era lido: `OFF` se comportava exatamente
  // como `SUGGEST`, então quem desligava a descoberta para parar de receber
  // propostas sobre máquina sem cadastro continuava recebendo todas elas. Uma
  // configuração que não faz nada é pior que uma que falta — ela é procurada,
  // encontrada, ajustada, e o problema continua.
  //
  // O que `OFF` desliga é o que o enum diz que ele governa: *o que o sistema faz
  // quando descobre máquina SEM CADASTRO*. A sugestão de posse e a de posto
  // compartilhado seguem rodando, porque elas falam de máquina que JÁ TEM
  // cadastro — é outra pergunta, e não é esta chave que a responde.
  if (configuracao.discoveryMode === 'OFF') return { sugeridas: 0, vinculadas: 0, colisoes: 0 };

  const lixoDoParque = repetidos ?? (await valoresRepetidosNoParque());

  // `findMany` e não SQL: a extensão de soft delete escopa esta consulta
  // sozinha, então ativo na LIXEIRA não entra na cascata sem ninguém escrever
  // filtro (core/database/soft-delete.extension.ts). Ativo APOSENTADO entra de
  // propósito — máquina que continua mandando handshake de um ativo vendido é
  // exatamente o achado que o painel de cobertura existe para mostrar.
  const candidatos = await prisma.asset.findMany({
    select: { id: true, assetTag: true, serial: true, name: true },
  });

  const porAtivo = casarEndpointComAtivos(endpoint, candidatos, lixoDoParque);
  const porEndpoint = casarEndpointComEndpoints(
    endpoint,
    await prisma.endpoint.findMany({
      where: { id: { not: endpoint.id }, mergedIntoId: null, assetId: { not: null } },
      select: SELECT_IDENTIDADE,
    }),
  );

  let sugeridas = 0;
  let vinculadas = 0;

  // MERGE ANTES DE LINK, e isso não é ordem de conveniência: quando o serial
  // casa com um ativo que JÁ TEM endpoint vinculado, o fato do mundo é que a
  // máquina foi reimaginada — propor o vínculo ali criaria uma disputa entre
  // duas linhas pelo mesmo ativo, que o `@unique` recusaria de qualquer jeito.
  for (const casamento of porEndpoint.casamentos) {
    await proporSugestao({
      kind: 'MERGE',
      endpointId: endpoint.id,
      mergeIntoEndpointId: casamento.alvoId,
      score: casamento.score,
      signal: casamento.signal,
      evidence: {
        motivo: 'A mesma identidade de hardware já pertence a outra máquina cadastrada.',
        sinal: casamento.signal,
        valor: casamento.valor,
        hwid: endpoint.hwid,
      },
      // A afirmação é o SINAL e o VALOR que casaram, e mais nada. O `hwid` está
      // na evidência para quem lê a tela, e fica fora daqui porque é constante
      // do par — repeti-lo no hash não distingue afirmação nenhuma.
      afirmacao: { sinal: casamento.signal, valor: casamento.valor },
    });
    sugeridas += 1;
  }

  if (porEndpoint.casamentos.length === 0) {
    const automatico = configuracao.discoveryMode === 'ON'
      && porAtivo.casamentos.length === 1
      && porAtivo.casamentos[0].score >= PONTOS_PARA_VINCULO_AUTOMATICO;

    if (automatico) {
      // Ator `null`: quem vinculou foi o sistema, e o D24 manda não inventar
      // ator — auditoria falsificada é pior que auditoria ausente.
      await vincularEndpointAoAtivo(endpoint.id, porAtivo.casamentos[0].alvoId, null, {
        automatico: true,
        sinal: porAtivo.casamentos[0].signal,
        valor: porAtivo.casamentos[0].valor,
      });
      vinculadas += 1;
    } else {
      for (const casamento of porAtivo.casamentos) {
        await proporSugestao({
          kind: 'LINK',
          endpointId: endpoint.id,
          assetId: casamento.alvoId,
          score: casamento.score,
          signal: casamento.signal,
          evidence: {
            sinal: casamento.signal,
            valor: casamento.valor,
            hostname: endpoint.hostname,
            hwid: endpoint.hwid,
          },
          // O `hostname` está na evidência e NÃO na afirmação: ele é renomeável
          // e volta atrás (é o que a tabela de pontos diz), então incluí-lo faria
          // um rename reoferecer uma sugestão recusada. O que afirma é o sinal e
          // o valor — e quando o serial chega, os dois mudam, que é exatamente o
          // caso que o D97 existe para não perder.
          afirmacao: { sinal: casamento.signal, valor: casamento.valor },
        });
        sugeridas += 1;
      }
    }
  }

  return { sugeridas, vinculadas, colisoes: colisoesDe(porAtivo) + colisoesDe(porEndpoint) };
}

function colisoesDe(resultado: ResultadoDaCascata): number {
  return resultado.colisoes.length;
}

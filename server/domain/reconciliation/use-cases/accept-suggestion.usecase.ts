import type { ReconciliationSuggestion } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { SUGGESTION_SELECT } from '../helpers/suggestion-select.helper';
import { vincularEndpointAoAtivo } from './link-endpoint-asset.usecase';
import { fundirEndpoints } from './merge-endpoints.usecase';

// "Sim." — e é aqui que a sugestão vira CADASTRO.
//
// ─────────────────────────────────────────────────────────────────────────────
// A REGRA QUE ATRAVESSA O ARQUIVO INTEIRO: nada aqui escreve direto.
//
// Aceitar um LINK chama o `vincularEndpointAoAtivo`; aceitar um MERGE chama o
// `fundirEndpoints`. Os dois já carregam o `ActivityLog` e o encerramento das
// sugestões que a operação tornou obsoletas — e uma segunda escrita, direta,
// divergiria deles no primeiro ajuste. A fila PROPÕE; quem GRAVA é o dono do
// assunto.
// ─────────────────────────────────────────────────────────────────────────────

type Sugestao = Pick<
  ReconciliationSuggestion,
  'id' | 'kind' | 'state' | 'endpointId' | 'assetId' | 'mergeIntoEndpointId'
>;

async function carregarPendente(id: string): Promise<Sugestao> {
  const sugestao = await prisma.reconciliationSuggestion.findUnique({
    where: { id },
    select: {
      id: true, kind: true, state: true, endpointId: true, assetId: true,
      mergeIntoEndpointId: true,
    },
  });
  if (!sugestao) throw new AppError('Sugestão não encontrada.', 404);
  if (sugestao.state !== 'PENDING') throw new AppError('Esta sugestão já foi resolvida.', 409);
  return sugestao;
}

/** Fecha a sugestão. Chamado DEPOIS de a ação ter dado certo, nunca antes. */
async function marcarAceita(id: string, actorId: string | null) {
  return prisma.reconciliationSuggestion.update({
    where: { id },
    data: { state: 'ACCEPTED', resolvedAt: new Date(), resolvedById: actorId },
    select: SUGGESTION_SELECT,
  });
}

/**
 * Executa o que a sugestão propõe.
 *
 * A ação e o fechamento NÃO estão na mesma transação, e isso é deliberado: as
 * ações chamam use-cases que abrem transação própria, e aninhar transação do
 * Prisma dentro de transação não é suportado. A ordem — agir, depois fechar — é
 * a que erra para o lado certo: se o processo morrer no meio, a sugestão
 * continua `PENDING` e alguém a vê de novo numa fila que já reflete o cadastro
 * novo. O contrário deixaria uma sugestão "aceita" que nunca aconteceu.
 */
export async function aceitarSugestao(id: string, actorId: string | null) {
  const sugestao = await carregarPendente(id);

  switch (sugestao.kind) {
    case 'LINK': {
      if (!sugestao.assetId) throw new AppError('Sugestão de vínculo sem ativo.', 422);
      await vincularEndpointAoAtivo(sugestao.endpointId, sugestao.assetId, actorId, { sugestaoId: id });
      break;
    }

    case 'MERGE': {
      if (!sugestao.mergeIntoEndpointId) throw new AppError('Sugestão de fusão sem máquina de destino.', 422);

      // O ENDPOINT DA SUGESTÃO É O PERDEDOR, sempre: a sugestão nasce quando a
      // máquina NOVA (sem vínculo) casa com uma já cadastrada, e o que se
      // preserva é a linha que tem o histórico e o ativo. Inverter isso
      // significaria mover a telemetria antiga para a linha nova e perder o
      // vínculo no caminho.
      await fundirEndpoints(sugestao.endpointId, sugestao.mergeIntoEndpointId, actorId);
      break;
    }

    default:
      // Nenhum tipo fica de fora hoje. O `default` continua aqui porque
      // `SuggestionKind` é um enum do banco e cresce por migração: um tipo novo
      // sem tratamento tem que falhar alto, não passar em silêncio — sugestão
      // aceita que não faz nada é a forma mais convincente de mentir para quem
      // está na tela.
      throw new AppError('Este tipo de sugestão ainda não pode ser aceito.', 422);
  }

  return marcarAceita(id, actorId);
}

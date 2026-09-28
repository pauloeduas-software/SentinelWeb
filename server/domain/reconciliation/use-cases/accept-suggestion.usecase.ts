import type { ReconciliationSuggestion } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { SUGGESTION_SELECT } from '../helpers/suggestion-select.helper';
import { vincularEndpointAoAtivo } from './link-endpoint-asset.usecase';
import { checkoutAsset } from '../../assignment/use-cases/checkout-asset.usecase';
import { checkinAsset } from '../../assignment/use-cases/checkin-asset.usecase';
import { addLocationOccupant } from '../../occupancy/use-cases/add-location-occupant.usecase';
import { pessoasDaEvidencia } from './detect-shared-post.usecase';
import { fundirEndpoints } from './merge-endpoints.usecase';

// "Sim." — e é aqui que a sugestão vira CADASTRO.
//
// ─────────────────────────────────────────────────────────────────────────────
// A REGRA QUE ATRAVESSA O ARQUIVO INTEIRO: nada aqui escreve posse direto.
//
// Aceitar um CHECKOUT chama o `checkoutAsset` da F4; aceitar uma OCCUPANCY chama
// o `addLocationOccupant`. Os dois já carregam o zod da borda, o `ActivityLog`,
// a trava na linha do colaborador e as invariantes 1, 2 e 4 — e uma segunda
// escrita, direta, divergiria delas no primeiro ajuste. A fila PROPÕE; quem
// GRAVA é o dono do assunto.
// ─────────────────────────────────────────────────────────────────────────────

export interface AceiteExtra {
  /** Usado pelo `SHARED_POST`, quando a pessoa escolhe outro posto na tela. */
  locationId?: string | null;
  shift?: string | null;
}

type Sugestao = Pick<
  ReconciliationSuggestion,
  'id' | 'kind' | 'state' | 'endpointId' | 'assetId' | 'targetUserId' | 'targetLocationId' | 'mergeIntoEndpointId' | 'shift' | 'evidence'
>;

async function carregarPendente(id: string): Promise<Sugestao> {
  const sugestao = await prisma.reconciliationSuggestion.findUnique({
    where: { id },
    select: {
      id: true, kind: true, state: true, endpointId: true, assetId: true,
      targetUserId: true, targetLocationId: true, mergeIntoEndpointId: true, shift: true, evidence: true,
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
 * ações chamam use-cases que abrem transação própria (o checkout da F4 tem seis
 * passos e uma trava), e aninhar transação do Prisma dentro de transação não é
 * suportado. A ordem — agir, depois fechar — é a que erra para o lado certo: se
 * o processo morrer no meio, a sugestão continua `PENDING` e alguém a vê de novo
 * numa fila que já reflete o cadastro novo. O contrário deixaria uma sugestão
 * "aceita" que nunca aconteceu.
 */
export async function aceitarSugestao(id: string, actorId: string | null, extra: AceiteExtra = {}) {
  const sugestao = await carregarPendente(id);

  switch (sugestao.kind) {
    case 'LINK': {
      if (!sugestao.assetId) throw new AppError('Sugestão de vínculo sem ativo.', 422);
      await vincularEndpointAoAtivo(sugestao.endpointId, sugestao.assetId, actorId, { sugestaoId: id });
      break;
    }

    case 'CHECKOUT': {
      if (!sugestao.assetId || !sugestao.targetUserId) {
        throw new AppError('Sugestão de posse incompleta.', 422);
      }

      // REATRIBUIÇÃO é devolução + entrega, nesta ordem e nunca uma só: a
      // invariante 1 (`assignments_um_aberto_por_ativo`) recusaria a segunda
      // posse aberta, e o histórico precisa mostrar que o equipamento passou de
      // uma pessoa para outra — não que mudou de dono por edição.
      const aberta = await prisma.assignment.findFirst({
        where: { assetId: sugestao.assetId, checkinAt: null },
        select: { id: true, targetType: true, targetUserId: true },
      });

      // Guarda de barriga, e ela não é redundante: a sugestão pode ter nascido
      // quando o ativo era de uma PESSOA e ser aceita depois de alguém tê-lo
      // entregue a um POSTO. Aceitar aqui fecharia a posse do posto e apagaria
      // os ocupantes da responsabilidade — o estrago exato que o D47 descreve,
      // acontecendo pela janela de tempo entre sugerir e aceitar.
      if (aberta?.targetType === 'LOCATION') {
        throw new AppError(
          'Este ativo passou a ser de um posto de trabalho. Aceitar esta sugestão desfaria a posse do posto — '
          + 'a sugestão correta agora é de ocupação.',
          409,
        );
      }

      // O CADASTRO JÁ BATE — e aceitar aqui seria FABRICAR HISTÓRICO (D110).
      //
      // O aceite de reatribuição é checkin + checkout. Com o ativo já entregue à
      // mesma pessoa, esses dois passos gravam uma DEVOLUÇÃO QUE NUNCA ACONTECEU
      // e uma entrega nova para quem já estava com o equipamento: o histórico do
      // ativo passa a dizer que ele voltou ao estoque numa data em que não
      // voltou. Num sistema cujo núcleo é o razão de posse, isso é pior que uma
      // sugestão errada — é uma afirmação falsa sobre o passado, e ninguém tem
      // como descobrir que ela é falsa.
      //
      // O caso normalmente nem chega aqui: o `encerrarSugestoesObsoletas` do job
      // tira essa sugestão da fila. Esta guarda cobre a janela de até uma hora
      // entre o mundo mudar e a rodada seguinte.
      if (aberta?.targetType === 'USER' && aberta.targetUserId === sugestao.targetUserId) {
        throw new AppError(
          'Este ativo já está entregue a esta pessoa. Não há nada a fazer — a sugestão sai da fila na próxima varredura.',
          409,
        );
      }

      if (aberta) {
        await checkinAsset(sugestao.assetId, { checkinNotes: 'Devolução automática: reatribuição sugerida pelo agente.' }, actorId);
      }

      await checkoutAsset(
        sugestao.assetId,
        {
          targetType: 'USER',
          targetUserId: sugestao.targetUserId,
          checkoutNotes: 'Entrega sugerida pelo agente, a partir do usuário logado na máquina.',
        },
        actorId,
      );
      break;
    }

    case 'OCCUPANCY': {
      if (!sugestao.targetUserId) throw new AppError('Sugestão de ocupação sem pessoa.', 422);

      // O posto vem da sugestão, mas quem aceita pode escolher outro: a tela
      // mostra o posto inferido e deixa trocar, porque o sistema só sabe a que
      // posto o ATIVO está entregue — e o ativo pode estar no posto errado.
      const locationId = extra.locationId ?? sugestao.targetLocationId;
      if (!locationId) throw new AppError('Sugestão de ocupação sem posto.', 422);

      // A GUARDA SIMÉTRICA À DO CHECKOUT (D110). A ocupação é sugerida porque o
      // ATIVO está entregue àquele posto; se a posse saiu de lá entre sugerir e
      // aceitar, a evidência que sustentava a proposta desapareceu e cadastrar o
      // ocupante seria registrar uma conclusão a partir de um fato que mudou.
      //
      // Só vale quando o posto é o da SUGESTÃO: se quem aceita escolheu outro na
      // tela, a escolha é dele — o sistema só sabe a que posto o ativo está
      // entregue, e o ativo pode estar no posto errado.
      if (!extra.locationId && sugestao.assetId) {
        const posse = await prisma.assignment.findFirst({
          where: { assetId: sugestao.assetId, checkinAt: null },
          select: { targetType: true, targetLocationId: true },
        });
        if (posse?.targetType !== 'LOCATION' || posse.targetLocationId !== locationId) {
          throw new AppError(
            'Este ativo não está mais entregue a este posto de trabalho. Escolha o posto certo ou deixe a sugestão sair da fila.',
            409,
          );
        }
      }

      await addLocationOccupant(
        locationId,
        {
          userId: sugestao.targetUserId,
          // O turno é PALPITE (D15): o que a pessoa escolher na tela vence o que
          // o histograma de horas inferiu.
          shift: extra.shift ?? sugestao.shift,
          notes: 'Ocupação sugerida pelo agente, a partir do usuário logado na máquina.',
        },
        actorId,
      );
      break;
    }

    case 'SHARED_POST': {
      if (!sugestao.assetId) throw new AppError('Sugestão de posto compartilhado sem ativo.', 422);

      const locationId = extra.locationId ?? sugestao.targetLocationId;
      if (!locationId) {
        throw new AppError(
          'Escolha o posto de trabalho que esta máquina atende antes de aceitar.',
          422,
        );
      }

      const pessoas = pessoasDaEvidencia(sugestao.evidence);
      if (pessoas.length < 2) {
        throw new AppError('A evidência desta sugestão não tem duas pessoas identificadas.', 422);
      }

      // A SEQUÊNCIA INTEIRA, e não um passo só: devolver do dono atual, entregar
      // ao posto e abrir as ocupações. Fazer metade é pior que não fazer — um
      // ativo entregue ao posto sem ocupante nenhum é um "posto vago" falso, que
      // é justamente o sinal que a tela de postos usa para dizer que ninguém
      // responde pelo equipamento.
      const aberta = await prisma.assignment.findFirst({
        where: { assetId: sugestao.assetId, checkinAt: null },
        select: { id: true, targetType: true, targetLocationId: true },
      });

      const jaEstaNoPosto = aberta?.targetType === 'LOCATION' && aberta.targetLocationId === locationId;

      if (aberta && !jaEstaNoPosto) {
        await checkinAsset(
          sugestao.assetId,
          { checkinNotes: 'Devolução automática: a máquina virou posto compartilhado.' },
          actorId,
        );
      }

      if (!jaEstaNoPosto) {
        await checkoutAsset(
          sugestao.assetId,
          {
            targetType: 'LOCATION',
            targetLocationId: locationId,
            checkoutNotes: 'Entrega ao posto, sugerida pelo agente: dois ou mais usuários em turnos.',
          },
          actorId,
        );
      }

      for (const pessoa of pessoas) {
        // Uma pessoa que já ocupa o posto faz o `addLocationOccupant` devolver
        // 409, e aqui isso NÃO é erro: é meio caminho já andado. Derrubar a
        // operação inteira por causa dela deixaria as outras ocupações por
        // abrir — e a sugestão ficaria pendente sobre um cadastro que já mudou.
        const jaOcupa = await prisma.locationOccupant.findFirst({
          where: { locationId, userId: pessoa.userId, endedAt: null },
          select: { id: true },
        });
        if (jaOcupa) continue;

        await addLocationOccupant(
          locationId,
          {
            userId: pessoa.userId,
            shift: extra.shift ?? pessoa.turno,
            notes: 'Ocupação sugerida pelo agente: usuário logado nesta máquina com recorrência.',
          },
          actorId,
        );
      }
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

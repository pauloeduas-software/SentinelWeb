import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { errorCode } from '../../../core/errors/error-shape';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { ASSET_SELECT } from '../../asset/helpers/asset-select.helper';
import { assertStatusCoerenteComPosse } from '../../asset/use-cases/assert-status-posse.usecase';
import { travarAtivoOuFalhar } from '../../asset/use-cases/lock-asset.usecase';
import { diaEmPortugues } from '../../asset/helpers/asset-dates.helper';
import {
  assertEscolhaAtiva, assertLocalRecebe, lerStatusTravado,
} from '../../catalog/helpers/catalog-lock.helper';
import { ASSIGNMENT_SELECT } from '../helpers/assignment-select.helper';
import { travarUsuarioOuFalhar, type ClienteQueTrava } from '../../user/use-cases/lock-user.usecase';
import { ativoDoPosto, jaTemAtivo } from '../../workstation/helpers/ativo-do-posto.helper';
import type { AlvoPosse, ClientePosse } from './resolve-responsibles.usecase';

// A ENTREGA — Camada 1 do docs/referencia/modelo-de-posse.md.
//
// É uma das duas únicas operações que escrevem `Asset.assignedToId` (a outra é
// a devolução). O formulário de ativo perdeu esse campo na F4 de propósito: um
// campo editável à mão ao lado de uma tabela de posse são duas fontes de verdade
// para o mesmo fato, e nada impede divergirem (D14).

export interface CheckoutData {
  targetType: AlvoPosse;
  targetUserId?: string | null;
  targetLocationId?: string | null;
  statusId?: string | null;
  expectedCheckinAt?: Date | null;
  checkoutNotes?: string | null;

  // ── AS DUAS CHAVES DA IMPORTAÇÃO (F10, D131) ──────────────────────────────
  //
  // NENHUMA DAS DUAS ESTÁ NO `checkoutSchema`, e isso é a defesa: o
  // `strictObject` da borda recusa com 422 quem as mandar pela API. Elas só
  // existem para quem chama este use-case de dentro do servidor — hoje, o
  // importador de CSV.

  /**
   * QUANDO a entrega aconteceu no mundo físico. Ausente, é agora (o
   * `@default(now())` da coluna).
   *
   * Existe porque a carga inicial de uma empresa é um CSV de equipamento que já
   * está na mão das pessoas há anos: gravar tudo com a data de hoje faria o
   * histórico de posse nascer mentindo, e é justamente o histórico que alguém
   * abre para perguntar "desde quando isto é dele?".
   *
   * A data é validada como NÃO FUTURA na borda do importador
   * (`dataNaoFutura`, em shared/fields.schema.ts) — e não aqui, porque este
   * use-case recebe `Date` já construído, não string de formulário.
   */
  checkoutAt?: Date | null;

  /**
   * Não emite termo de entrega e não manda e-mail nenhum.
   *
   * POR QUE ISTO EXISTE: importar 500 equipamentos já entregues emitiria 500
   * termos e mandaria 500 convites para assinar o recebimento de um notebook
   * que a pessoa usa desde 2024. O termo ficaria pendente para sempre — ele
   * nasce `PENDENTE` e só o aceite o fecha —, então a primeira importação
   * encheria a tela de pendência que ninguém pode resolver, e o e-mail já teria
   * saído: não há como desfazer.
   *
   * A TELA NUNCA PASSA ISTO. Entrega feita por gente continua emitindo termo e
   * avisando, que é o fluxo da F4 inteiro.
   */
}

/**
 * A MESMA frase nos dois caminhos que recusam a segunda entrega: a checagem
 * explícita e o índice único parcial do banco. Texto duplicado aqui seria a
 * mesma recusa dita de dois jeitos, dependendo de quem chegou primeiro.
 */
const JA_ENTREGUE = 'Este ativo já está entregue. Faça a devolução antes.';

const TIPOS_DE_ALVO = ['USER', 'LOCATION'] as const;

/** Qual das duas FKs nuláveis pertence a cada `targetType`. */
const FK_DO_ALVO = {
  USER: 'targetUserId',
  LOCATION: 'targetLocationId',
} as const;

const ROTULO_DO_ALVO = {
  USER: 'um colaborador (targetUserId)',
  LOCATION: 'uma localização (targetLocationId)',
} as const;

/**
 * Coerência do alvo polimórfico: exatamente UMA das duas FKs preenchida, e a
 * que casa com o `targetType`.
 *
 * O banco TAMBÉM garante — é o CHECK `assignments_alvo_coerente`, escrito à mão
 * na migration, porque CHECK não é expressável no schema do Prisma. Esta função
 * continua existindo para dar 422 com o nome do campo que falta: o erro do CHECK
 * viraria uma mensagem sobre constraint, que não ensina nada a quem preencheu o
 * formulário. E ela é a PRIMEIRA coisa que roda, antes de abrir transação.
 *
 * Devolve o id do alvo já escolhido: o resto do use-case grava a partir dele, e
 * nunca mais lê as duas chaves do corpo.
 */
function assertAlvoCoerente(data: CheckoutData): string {
  const alvoId = data[FK_DO_ALVO[data.targetType]];
  const intrusas = TIPOS_DE_ALVO.filter((tipo) => tipo !== data.targetType && data[FK_DO_ALVO[tipo]]);

  if (intrusas.length > 0) {
    throw new AppError(
      'Uma entrega tem UM alvo: preencha só a chave que corresponde ao targetType.',
      422,
      { targetType: data.targetType, sobrando: intrusas.map((tipo) => FK_DO_ALVO[tipo]) },
    );
  }

  if (!alvoId) {
    throw new AppError(`Entrega do tipo "${data.targetType}" exige ${ROTULO_DO_ALVO[data.targetType]}.`, 422);
  }

  return alvoId;
}

/**
 * O alvo existe?
 *
 * Deixar a FK falhar responderia 409 "Registro está em uso por outro cadastro"
 * — o texto que o `error-handler` dá a todo `P2003` —, que não é nem o status
 * nem a frase certa para "essa pessoa não existe". Conferir antes custa uma
 * consulta e devolve 404 com o nome do que faltou.
 *
 * Pessoa sai por `findFirst`, que o escopo da lixeira alcança: NÃO se entrega
 * equipamento a um cadastro na lixeira. Localização não tem lixeira; ela sai
 * travada, pela marca de desativada.
 */
async function assertAlvoExiste(
  client: ClientePosse & ClienteQueTrava,
  tipo: AlvoPosse,
  alvoId: string,
): Promise<void> {
  if (tipo === 'USER') {
    const pessoa = await client.user.findFirst({
      where: { id: alvoId },
      select: { id: true, name: true, isActive: true },
    });
    if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);

    // DESLIGADO é diferente de APAGADO, e os dois precisam ser recusados aqui
    // (D32). Quem saiu da empresa continua no cadastro — é o histórico de posse
    // que exige isso —, mas entregar equipamento a ele reabriria, uma linha
    // depois do desligamento, exatamente a pendência que o desligamento fechou.
    // 409 e não 404: a pessoa existe, o estado dela é que recusa.
    if (!pessoa.isActive) {
      throw new AppError(`${pessoa.name} está desligado(a) e não pode receber equipamento.`, 409);
    }
    return;
  }

  // DESATIVADA é a mesma recusa do colaborador desligado, um degrau acima: o
  // local continua no histórico e não recebe entrega nova. `UPDATE` e não
  // `SHARE`: a invariante 19 trava este mesmo posto `FOR UPDATE` logo adiante,
  // e subir de uma para a outra é deadlock entre duas entregas ao mesmo posto.
  await assertLocalRecebe(client, alvoId, 'entrega nova', 'UPDATE');
}

/**
 * O status padrão de uma das duas pontas da posse: o primeiro do TIPO, por nome.
 *
 * Mora no checkout e é importado pelo checkin porque é a MESMA regra nas duas
 * pontas — um terceiro arquivo para uma consulta de cinco linhas é a cerimônia
 * que o docs/referencia/arquitetura.md recusa, e duas cópias divergiriam no primeiro
 * ajuste de mensagem.
 *
 * Ordenado por nome, e não "o primeiro que vier": sem `orderBy` o Postgres não
 * promete ordem nenhuma, e a entrega mudaria de status entre duas execuções
 * idênticas conforme o plano de consulta.
 *
 * A ESCOLHA É RELIDA TRAVADA. Entre o `findFirst` e a gravação, o rótulo
 * escolhido — sem nenhum ativo ainda — pode ter o tipo trocado; a releitura
 * `FOR SHARE` espera a troca confirmar e enxerga o tipo novo. Mudou, a
 * operação recusa em vez de gravar um status que contradiz a posse.
 */
export async function escolherStatusPorTipo(
  client: ClientePosse & ClienteQueTrava,
  tipo: 'DEPLOYABLE' | 'IN_USE',
  rotulo: string,
): Promise<string> {
  // Só entre os ATIVOS: o status desativado saiu de linha e não é mais
  // aplicado a ninguém, nem pela escolha automática.
  const escolhido = await client.statusLabel.findFirst({
    where: { type: tipo, isActive: true },
    select: { id: true },
    orderBy: { name: 'asc' },
  });
  if (!escolhido) {
    throw new AppError(`Nenhum status ativo do tipo "${rotulo}". Reative um em Configurações › Status ou escolha o status à mão.`, 409);
  }

  const status = await lerStatusTravado(client, escolhido.id);
  if (status.type !== tipo || !status.isActive) {
    throw new AppError(`O status "${status.name}" acabou de mudar. Tente de novo.`, 409);
  }
  return status.id;
}

/**
 * O status escolhido à mão existe (404) e está ATIVO (409). Lê travado, pelo
 * mesmo motivo do `escolherStatusPorTipo`.
 */
export async function assertStatusEscolhivel(client: ClienteQueTrava, statusId: string): Promise<void> {
  assertEscolhaAtiva(await lerStatusTravado(client, statusId), { rotulo: 'O status' });
}

export async function checkoutAsset(assetId: string, data: CheckoutData, actorId: string | null) {
  const resultado = await executarCheckout(assetId, data, actorId);

  return resultado;
}

async function executarCheckout(assetId: string, data: CheckoutData, actorId: string | null) {
  // Fora da transação: é validação de FORMATO do corpo, não lê o banco, e
  // abrir transação para recusar um payload incoerente é segurar conexão à toa.
  const alvoId = assertAlvoCoerente(data);

  // TUDO o mais em UMA transação. A entrega escreve em três lugares
  // (`assignments`, `assets` e `activity_logs`) e os três descrevem o mesmo
  // evento: uma posse aberta sem o status novo é um ativo "disponível" que já
  // está com alguém — exatamente o estado que o modelo existe para impedir.
  return prisma.$transaction(async (tx) => {
    // A TRAVA, antes de qualquer leitura — e antes do ativo, que é a ordem
    // combinada (`user/use-cases/lock-user.usecase.ts`).
    //
    // Sem ela, `assertAlvoExiste` lê `isActive: true` de um colaborador que um
    // desligamento simultâneo está prestes a marcar como desligado, e a posse
    // nasce NO NOME DE UM DESLIGADO — o estado que o D32 existe para impedir e
    // que nenhuma consulta acusa, porque nada falhou.
    //
    // Só no alvo `USER`: entrega a posto não disputa linha de usuário nenhuma,
    // e travar à toa só aumentaria a chance de deadlock.
    if (data.targetType === 'USER') await travarUsuarioOuFalhar(tx, alvoId);

    // E O ATIVO, logo depois do usuário — a ordem do grafo (`lock-asset.usecase.ts`).
    //
    // Sem ela, a edição do ativo e a entrega corriam: a edição trocava o status
    // para um de estoque, a guarda estado × posse não via posse nenhuma, a
    // entrega confirmava, e o `UPDATE` da edição gravava "Disponível" por cima
    // de um ativo entregue. O alvo posto já travava o ativo na invariante 19,
    // mas tarde demais — depois de ler o ativo e o status dele.
    await travarAtivoOuFalhar(tx, assetId);

    // `findFirst`, nunca `findUnique`: o escopo da lixeira não alcança o
    // `findUnique` (soft-delete.extension.ts), e um ativo na lixeira não pode
    // ser entregue a ninguém.
    const ativo = await tx.asset.findFirst({
      where: { id: assetId },
      select: {
        id: true, assetTag: true, statusId: true, retiredAt: true,
        status: { select: { name: true, type: true } },
      },
    });
    if (!ativo) throw new AppError('Registro não encontrado', 404);

    // ATIVO BAIXADO NÃO SAI PARA NINGUÉM. Ele não é mais da empresa — foi
    // vendido, doado, roubado —, e o status dele pode muito bem ser
    // "Disponível", porque a baixa não mexe no status. Sem esta guarda, o
    // notebook vendido era entregue como se estivesse no estoque. É o que o
    // `Archived` do Snipe-IT garante, e o que a entrega de ASSENTO de licença
    // já recusava (`checkout-seat.usecase.ts`). A trava do ativo acima fecha a
    // corrida com a baixa simultânea.
    if (ativo.retiredAt) {
      throw new AppError(
        `${ativo.assetTag} teve baixa em ${diaEmPortugues(ativo.retiredAt)} e não pode ser entregue. Desfaça a baixa antes.`,
        409,
        { retiredAt: ativo.retiredAt.toISOString() },
      );
    }

    await assertAlvoExiste(tx, data.targetType, alvoId);

    const aberta = await tx.assignment.findFirst({
      where: { assetId, checkinAt: null },
      select: { id: true },
    });
    if (aberta) throw new AppError(JA_ENTREGUE, 409, { assignmentId: aberta.id });

    // A regra que dá sentido ao `StatusLabelType`: só `DEPLOYABLE` é "está no
    // estoque, pode ser entregue". Sem ela o tipo vira enfeite — foi essa a
    // contradição que a auditoria da F1 encontrou no rótulo "Em Uso" tipado
    // `DEPLOYABLE`, e que criou o `IN_USE`.
    if (ativo.status.type !== 'DEPLOYABLE') {
      throw new AppError(
        `Só ativo disponível pode ser entregue, e este está como "${ativo.status.name}".`,
        409,
        { statusType: ativo.status.type },
      );
    }

    // NO MÁXIMO UM ATIVO POR POSTO — a primeira das TRÊS portas; as outras são
    // a marca de posto (`catalog/specs/location.spec.ts`) e a restauração da
    // lixeira (`asset/use-cases/restore-asset.usecase.ts`). Depois de todas as
    // recusas baratas, e DENTRO da transação: não há índice único embaixo,
    // porque a regra cruza três tabelas. O helper devolve `null` para local que
    // não é posto de trabalho.
    if (data.targetType === 'LOCATION') {
      const ocupante = await ativoDoPosto(tx, alvoId, assetId);
      if (ocupante) throw new AppError(jaTemAtivo(ocupante), 409, { assetId: ocupante.id });
    }

    // O status escolhido à mão: existe (404) e NÃO é de estoque (422). A guarda
    // estado × posse abaixo também recusaria o `DEPLOYABLE`, mas com a frase da
    // edição — "faça a devolução antes" —, que manda devolver quem está
    // entregando. Aqui o erro é do formulário, e a frase diz isso.
    if (data.statusId) {
      const escolhido = await lerStatusTravado(tx, data.statusId);
      assertEscolhaAtiva(escolhido, { rotulo: 'O status' });
      if (escolhido.type === 'DEPLOYABLE') {
        throw new AppError(
          `"${escolhido.name}" é um status de estoque e não serve para um ativo entregue. Escolha outro.`,
          422,
          { statusType: escolhido.type },
        );
      }
    }
    const statusId = data.statusId ?? (await escolherStatusPorTipo(tx, 'IN_USE', 'Em uso'));

    let posse;
    try {
      posse = await tx.assignment.create({
        data: {
          assetId,
          targetType: data.targetType,
          // As duas FKs saem do alvo já validado, e não do corpo: gravar a
          // partir de UMA variável é o que garante que a outra fique nula, em
          // vez de depender de o cliente ter mandado só uma.
          targetUserId: data.targetType === 'USER' ? alvoId : null,
          targetLocationId: data.targetType === 'LOCATION' ? alvoId : null,
          expectedCheckinAt: data.expectedCheckinAt ?? null,
          checkoutNotes: data.checkoutNotes ?? null,
          // `undefined` e não `null`: a coluna é obrigatória com
          // `@default(now())`, então omitir é o que deixa o banco carimbar a
          // hora. Um `null` aqui seria violação de NOT NULL, não "use o padrão".
          checkoutAt: data.checkoutAt ?? undefined,
          // QUEM ENTREGOU. A coluna nasceu nulável esperando a F3 e a partir
          // daqui tem nome — e este nome não é trilha de auditoria: ele sai
          // IMPRESSO no termo de entrega (F4), que é dado de negócio e precisa
          // sobreviver a qualquer expurgo do ActivityLog (D25). O que ficou
          // para trás continua nulo de propósito: não há backfill (D24).
          checkoutById: actorId,
        },
        select: ASSIGNMENT_SELECT,
      });
    } catch (erro) {
      // A REDE EMBAIXO. A checagem acima resolve o caso comum, mas duas
      // entregas simultâneas do mesmo ativo passam as duas por ela: em READ
      // COMMITTED nenhuma enxerga a posse que a outra ainda não confirmou. Quem
      // decide é o índice único parcial `assignments_um_aberto_por_ativo`, e o
      // perdedor precisa receber a MESMA frase do vencedor — não o 409
      // genérico "Registro já existe" do error-handler, que não diz o que fazer.
      if (errorCode(erro) === 'P2002') throw new AppError(JA_ENTREGUE, 409);
      throw erro;
    }

    // Invariante estado × posse, reaproveitada do domínio do ativo em vez de
    // recopiada aqui. Ela lê a posse ABERTA, então só funciona DEPOIS do
    // `create` — antes dele não há posse nenhuma para contradizer. Se o
    // `statusId` escolhido à mão for de estoque, a transação
    // inteira volta atrás e nenhuma das três escritas acontece.
    await assertStatusCoerenteComPosse(tx, assetId, statusId);

    const ativoAtualizado = await tx.asset.update({
      where: { id: assetId },
      data: {
        statusId,
        // CACHE do caso `USER`, e só dele: entregue a uma localização, quem
        // responde são os ocupantes do posto, e um id de pessoa aqui seria uma
        // resposta que a Camada 3 não daria.
        assignedToId: data.targetType === 'USER' ? alvoId : null,
      },
      select: ASSET_SELECT,
    });

    // No histórico do ATIVO, não no da posse: é a linha do tempo do equipamento
    // que alguém abre para perguntar "por onde isto andou".
    await recordActivity(
      tx,
      {
        entityType: 'Asset',
        entityId: assetId,
        action: 'CHECKOUT',
        changes: {
          assignmentId: posse.id,
          targetType: data.targetType,
          targetId: alvoId,
          statusId: { de: ativo.statusId, para: statusId },
        },
      },
      actorId,
    );

    return { assignment: posse, asset: ativoAtualizado };
  });
}

import { prisma } from '../../../core/database/prismaClient';
import { avisarEntrega, dispararAviso } from '../helpers/notificacao.helper';
import { APP_SETTING_ID } from '../../settings/helpers/app-setting.helper';
import { enviar } from '../../../core/mail/mailer';
import { issueAcceptance } from '../../acceptance/use-cases/issue-acceptance.usecase';
import { corpoDoConvite } from '../../acceptance/use-cases/remind-acceptance.usecase';
import { rotuloDoAlvoOuPadrao } from '../helpers/target-label.helper';
import { AppError } from '../../../core/errors/app-error';
import { errorCode } from '../../../core/errors/error-shape';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { ASSET_SELECT } from '../../asset/helpers/asset-select.helper';
import { assertStatusCoerenteComPosse } from '../../asset/use-cases/assert-status-posse.usecase';
import { ASSIGNMENT_SELECT } from '../helpers/assignment-select.helper';
import { travarUsuarioOuFalhar } from '../../user/use-cases/lock-user.usecase';
import type { AlvoPosse, ClientePosse } from './resolve-responsibles.usecase';

// A ENTREGA — Camada 1 do docs/MODELO-POSSE.md.
//
// É uma das duas únicas operações que escrevem `Asset.assignedToId` (a outra é
// a devolução). O formulário de ativo perdeu esse campo na F4 de propósito: um
// campo editável à mão ao lado de uma tabela de posse são duas fontes de verdade
// para o mesmo fato, e nada impede divergirem (D14).

export interface CheckoutData {
  targetType: AlvoPosse;
  targetUserId?: string | null;
  targetAssetId?: string | null;
  targetLocationId?: string | null;
  statusId?: string | null;
  expectedCheckinAt?: Date | null;
  checkoutNotes?: string | null;
}

/**
 * A MESMA frase nos dois caminhos que recusam a segunda entrega: a checagem
 * explícita e o índice único parcial do banco. Texto duplicado aqui seria a
 * mesma recusa dita de dois jeitos, dependendo de quem chegou primeiro.
 */
const JA_ENTREGUE = 'Este ativo já está entregue. Faça a devolução antes.';

const TIPOS_DE_ALVO = ['USER', 'ASSET', 'LOCATION'] as const;

/** Qual das três FKs nuláveis pertence a cada `targetType`. */
const FK_DO_ALVO = {
  USER: 'targetUserId',
  ASSET: 'targetAssetId',
  LOCATION: 'targetLocationId',
} as const;

const ROTULO_DO_ALVO = {
  USER: 'um colaborador (targetUserId)',
  ASSET: 'um ativo detentor (targetAssetId)',
  LOCATION: 'uma localização (targetLocationId)',
} as const;

/**
 * Coerência do alvo polimórfico: exatamente UMA das três FKs preenchida, e a
 * que casa com o `targetType`.
 *
 * Isto existe porque o banco NÃO garante: CHECK constraint não é expressável no
 * schema do Prisma, então `targetType: 'USER'` com `targetLocationId`
 * preenchido é uma linha que o Postgres aceita sem reclamar — e que a Camada 3
 * resolveria como "sem responsável", em silêncio. A guarda é da aplicação por
 * falta de opção, e por isso ela é a PRIMEIRA coisa que roda.
 *
 * Devolve o id do alvo já escolhido: o resto do use-case grava a partir dele, e
 * nunca mais lê as três chaves do corpo.
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
 * Pessoa e ativo saem por `findFirst`, que o escopo da lixeira alcança: NÃO se
 * entrega equipamento a um cadastro na lixeira nem se prende uma coisa a um
 * ativo que está na lixeira. Localização não tem lixeira (D8), então `findUnique`.
 */
async function assertAlvoExiste(client: ClientePosse, tipo: AlvoPosse, alvoId: string): Promise<void> {
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

  if (tipo === 'LOCATION') {
    const local = await client.location.findUnique({ where: { id: alvoId }, select: { id: true } });
    if (!local) throw new AppError('Localização não encontrada.', 404);
    return;
  }

  const detentor = await client.asset.findFirst({ where: { id: alvoId }, select: { id: true } });
  if (!detentor) throw new AppError('Ativo detentor não encontrado.', 404);
}

/**
 * O status padrão de uma das duas pontas da posse: o primeiro do TIPO, por nome.
 *
 * Mora no checkout e é importado pelo checkin porque é a MESMA regra nas duas
 * pontas — um terceiro arquivo para uma consulta de cinco linhas é a cerimônia
 * que o docs/ARQUITETURA.md recusa, e duas cópias divergiriam no primeiro
 * ajuste de mensagem.
 *
 * Ordenado por nome, e não "o primeiro que vier": sem `orderBy` o Postgres não
 * promete ordem nenhuma, e a entrega mudaria de status entre duas execuções
 * idênticas conforme o plano de consulta.
 */
export async function escolherStatusPorTipo(
  client: ClientePosse,
  tipo: 'DEPLOYABLE' | 'IN_USE',
  rotulo: string,
): Promise<string> {
  // A PREFERÊNCIA CONFIGURADA VENCE — `AppSetting.checkoutStatusId` para a
  // entrega, `checkinStatusId` para a devolução.
  //
  // Sem ela, a escolha é "o primeiro do tipo, por nome", que funciona com os 8
  // rótulos do seed e vira loteria assim que alguém cadastra "Em uso — home
  // office" e "Em uso — escritório": o status da entrega passa a depender da
  // ordem alfabética, e isso não está escrito em lugar nenhum que o operador
  // leia. Era a última pendência da F4.
  const preferido = await statusPreferido(client, tipo);
  if (preferido) return preferido;

  const status = await client.statusLabel.findFirst({
    where: { type: tipo },
    select: { id: true },
    orderBy: { name: 'asc' },
  });

  if (!status) throw new AppError(`Nenhum status de tipo "${rotulo}" cadastrado.`, 409);
  return status.id;
}

/**
 * O status escolhido nas configurações, se ele ainda existir E ainda for do
 * tipo certo.
 *
 * AS DUAS CONFERÊNCIAS IMPORTAM. O `SetNull` do schema cobre a exclusão, mas
 * não cobre a RETIPAGEM: alguém pode trocar o `type` do rótulo preferido de
 * `IN_USE` para `PENDING`, e aí a entrega passaria a aplicar um status que a
 * invariante estado × posse recusa — o checkout quebraria com uma mensagem
 * sobre coerência, e a causa estaria numa tela de configuração que ninguém
 * relacionaria. Tipo errado aqui vira "usa o padrão", em silêncio e correto.
 */
async function statusPreferido(
  client: ClientePosse,
  tipo: 'DEPLOYABLE' | 'IN_USE',
): Promise<string | null> {
  const config = await client.appSetting.findUnique({
    where: { id: APP_SETTING_ID },
    select: { checkoutStatusId: true, checkinStatusId: true },
  });

  const escolhido = tipo === 'IN_USE' ? config?.checkoutStatusId : config?.checkinStatusId;
  if (!escolhido) return null;

  const status = await client.statusLabel.findUnique({
    where: { id: escolhido },
    select: { id: true, type: true },
  });

  return status?.type === tipo ? status.id : null;
}

/** Mesmo motivo do `assertAlvoExiste`: 404 com frase própria em vez do P2003 genérico. */
export async function assertStatusExiste(client: ClientePosse, statusId: string): Promise<void> {
  const status = await client.statusLabel.findUnique({ where: { id: statusId }, select: { id: true } });
  if (!status) throw new AppError('Status não encontrado.', 404);
}

export async function checkoutAsset(assetId: string, data: CheckoutData, actorId: string | null) {
  const resultado = await executarCheckout(assetId, data, actorId);

  // O AVISO SAI DEPOIS DO COMMIT, e é por isso que ele está AQUI e não lá
  // dentro. SMTP não tem rollback: um e-mail disparado por transação que
  // reverteu avisa o colaborador de uma entrega que não existe, e não há como
  // desfazer. A recíproca também vale — falha de envio não desfaz a entrega
  // (D86), e `dispararAviso` engole a falha de propósito.
  // O CONVITE do termo sai junto com o aviso de entrega, e pelo mesmo motivo
  // está aqui fora: depois do commit. Um link de aceite mandado por transação
  // que reverteu aponta para um termo que não existe.
  if (resultado.termo) {
    const convite = corpoDoConvite({
      signerName: resultado.termo.signerName,
      assetTag: resultado.asset.assetTag,
      assetName: resultado.asset.name,
      token: resultado.termo.token,
    });
    dispararAviso(enviar({ para: [resultado.termo.signerEmail], ...convite }).then(() => undefined));
  }

  dispararAviso(avisarEntrega({
    assetId,
    assetTag: resultado.asset.assetTag,
    assetName: resultado.asset.name,
    targetType: resultado.assignment.targetType,
    targetUserId: resultado.assignment.targetUserId,
    targetLocationId: resultado.assignment.targetLocationId,
    targetLabel: rotuloDoAlvoOuPadrao(resultado.assignment),
    notes: resultado.assignment.checkoutNotes,
    expectedCheckinAt: resultado.assignment.expectedCheckinAt,
  }));

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
    // Só no alvo `USER`: entrega a posto ou a ativo detentor não disputa linha
    // de usuário nenhuma, e travar à toa só aumentaria a chance de deadlock.
    if (data.targetType === 'USER') await travarUsuarioOuFalhar(tx, alvoId);

    // `findFirst`, nunca `findUnique`: o escopo da lixeira não alcança o
    // `findUnique` (soft-delete.extension.ts), e um ativo na lixeira não pode
    // ser entregue a ninguém.
    const ativo = await tx.asset.findFirst({
      where: { id: assetId },
      select: { id: true, statusId: true, status: { select: { name: true, type: true } } },
    });
    if (!ativo) throw new AppError('Registro não encontrado', 404);

    // Ativo preso a si mesmo é um ciclo de tamanho 1: a Camada 3 pararia no
    // limite de um salto, mas o que ficaria gravado é uma posse que não diz
    // quem responde por nada.
    if (data.targetType === 'ASSET' && alvoId === assetId) {
      throw new AppError('Um ativo não pode ser entregue a si mesmo.', 422);
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

    if (data.statusId) await assertStatusExiste(tx, data.statusId);
    const statusId = data.statusId ?? (await escolherStatusPorTipo(tx, 'IN_USE', 'Em uso'));

    let posse;
    try {
      posse = await tx.assignment.create({
        data: {
          assetId,
          targetType: data.targetType,
          // As três FKs saem do alvo já validado, e não do corpo: gravar a
          // partir de UMA variável é o que garante que as outras duas fiquem
          // nulas, em vez de depender de o cliente ter mandado só uma.
          targetUserId: data.targetType === 'USER' ? alvoId : null,
          targetAssetId: data.targetType === 'ASSET' ? alvoId : null,
          targetLocationId: data.targetType === 'LOCATION' ? alvoId : null,
          expectedCheckinAt: data.expectedCheckinAt ?? null,
          checkoutNotes: data.checkoutNotes ?? null,
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
    // `statusId` escolhido à mão for de estoque ou de arquivo, a transação
    // inteira volta atrás e nenhuma das três escritas acontece.
    await assertStatusCoerenteComPosse(tx, assetId, statusId);

    const ativoAtualizado = await tx.asset.update({
      where: { id: assetId },
      data: {
        statusId,
        // CACHE do caso `USER`, e só dele: entregue a uma localização ou a
        // outro ativo, quem responde são os ocupantes do posto ou o detentor, e
        // um id de pessoa aqui seria uma resposta que a Camada 3 não daria.
        assignedToId: data.targetType === 'USER' ? alvoId : null,
      },
      select: ASSET_SELECT,
    });

    // O TERMO, dentro da MESMA transação: se a emissão falhar — o posto sem
    // gestor do D27 —, a entrega inteira volta atrás. Entregar em silêncio um
    // equipamento cuja categoria exige assinatura deixaria o documento sem dono
    // e ninguém saberia que ele deveria existir.
    //
    // Devolve `null` quando não há o que emitir: categoria sem
    // `requireAcceptance`, ou alvo `ASSET` (D87 — o detentor é um equipamento,
    // e o documento segue o ativo que o segura).
    const termo = await issueAcceptance(tx, {
      assignmentId: posse.id,
      assetId,
      targetType: data.targetType,
      targetUserId: data.targetUserId ?? null,
      targetLocationId: data.targetLocationId ?? null,
      assetTag: ativoAtualizado.assetTag,
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

    return { assignment: posse, asset: ativoAtualizado, termo };
  });
}

import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { assertStatusExiste, escolherStatusPorTipo } from '../../assignment/use-cases/checkout-asset.usecase';
import { fecharPosse } from '../../assignment/use-cases/close-assignment.usecase';
import {
  devolverAcessoriosDoUsuario, type AcessorioDevolvido,
} from '../../stock/use-cases/checkin-user-accessories.usecase';
import {
  devolverAssentosDoUsuario, type AssentoDevolvido,
} from '../../license/use-cases/checkin-user-seats.usecase';
import { USER_DETAIL_SELECT } from '../helpers/user-select.helper';
import {
  contarChefias, motivoParaExigirSubstituto, temChefia, transferirChefias,
  type ChefiasTransferidas,
} from '../helpers/substituto.helper';
import { travarUsuarioOuFalhar } from './lock-user.usecase';

// DESLIGAMENTO — D32. As DUAS camadas, numa transação só.
//
// O nome é `offboard`, e não `checkin-all`: quem lê "check-in de tudo" não
// espera que a operação mexa em POSTO — e é essa exatamente a metade que se
// esquece. Devolver os ativos diretos e deixar a Laura ocupando a Mesa 1 mantém
// um desligado como responsável resolvido por todo equipamento daquele posto:
// `resolverResponsaveis()` continua devolvendo o nome dele, meses depois, e
// nenhuma consulta acusa nada, porque a responsabilidade é DERIVADA
// (docs/MODELO-POSSE.md, Camada 3).
//
// ─────────────────────────────────────────────────────────────────────────────
// DESLIGAR NÃO É APAGAR, e as duas colunas existem separadas por isso.
//
//   `terminatedAt` + `isActive = false`  saiu da empresa. O cadastro FICA, com
//                                        todo o histórico de posse apontando
//                                        para ele — é o que responde "quem
//                                        estava com este notebook em março?".
//   `deletedAt`                          o cadastro foi um erro. Lixeira.
//
// Por isso esta operação NUNCA escreve `deletedAt`. Quem confunde as duas perde
// o histórico de uma pessoa real para "limpar a lista" — e o histórico é a
// única prova que o inventário tem num inquérito trabalhista.
// ─────────────────────────────────────────────────────────────────────────────
//
// TUDO numa `$transaction` porque os quatro passos são UM fato. Metade aplicada é
// o pior de todos os estados: o desligado sem ativos mas ainda ocupando a Mesa
// 1 é exatamente o bug que o D32 existe para impedir, e ele nasceria de um
// `Promise.all` que falhou no meio.

export interface OffboardData {
  /** Vai para o `checkinNotes` de cada devolução e para o log do desligamento. */
  notes?: string | null;
  /** Status de volta dos ativos. Ausente, o primeiro `DEPLOYABLE` — o estoque. */
  statusId?: string | null;
  /**
   * Quem assume as chefias desta pessoa (F11, Etapa G).
   *
   * Obrigatório, com 409, quando ela gere gente, localidade ou departamento —
   * ver `helpers/substituto.helper.ts`, que explica por que a localidade é a que
   * tem dentes.
   */
  substitutoId?: string | null;
}

export interface AtivoDevolvido {
  assignmentId: string;
  assetId: string;
  assetTag: string;
}

export interface OcupacaoEncerrada {
  id: string;
  locationId: string;
  locationName: string;
  shift: string | null;
}

export interface ResultadoDesligamento {
  user: { id: string; name: string; email: string; isActive: boolean; terminatedAt: Date | null };
  devolvidos: AtivoDevolvido[];
  /** Unidades de acessório de alvo `USER` fechadas — NUNCA as do posto (F5). */
  acessoriosDevolvidos: AcessorioDevolvido[];
  /**
   * Assentos de licença da PESSOA fechados — NUNCA os dos ativos dela (F6).
   *
   * Cada um diz se foi QUEIMADO: `reassignable = false` mais desligamento é
   * perda patrimonial acontecendo num fluxo automático, em que ninguém está
   * olhando para a licença. A tela mostra o placar antes de confirmar.
   */
  assentosDevolvidos: AssentoDevolvido[];
  ocupacoesEncerradas: OcupacaoEncerrada[];
  /**
   * O que o substituto assumiu. `null` quando a pessoa não geria nada.
   *
   * Vai para a tela porque é a parte do desligamento que mexe no cadastro de
   * OUTRAS pessoas e lugares: o operador precisa ver que seis mesas trocaram de
   * gestor, não descobrir isso depois.
   */
  chefiasTransferidas: ChefiasTransferidas | null;
  /** Tokens pessoais revogados e sessões derrubadas (F11, Etapa G, passo 5). */
  acessoRevogado: { tokens: number; sessoesDerrubadas: boolean };
}

export async function offboardUser(
  userId: string,
  data: OffboardData,
  /** Quem desligou (D23). Nulo enquanto a rota não exigir sessão. */
  actorId: string | null = null,
): Promise<ResultadoDesligamento> {
  return prisma.$transaction(async (tx) => {
    // A TRAVA, antes de tudo. Ela é a outra metade da defesa do checkout: aqui
    // ela impede que uma entrega simultânea leia `isActive: true` e crie uma
    // posse DEPOIS de este desligamento ter lido a lista do que fechar.
    //
    // Sem as duas pontas travando a MESMA linha, o desligado termina com posse
    // aberta e o `DELETE` passa a responder 409 para sempre, sobre um ativo que
    // a tela do desligamento já não oferece devolver
    // (`user/use-cases/lock-user.usecase.ts`).
    await travarUsuarioOuFalhar(tx, userId);

    // `findFirst` pelo escopo da lixeira: colaborador apagado precisa ser
    // restaurado antes. Desligar quem está na lixeira escreveria história sobre
    // um cadastro que nenhuma tela enxerga.
    const pessoa = await tx.user.findFirst({
      where: { id: userId },
      select: { id: true, name: true, terminatedAt: true },
    });
    if (!pessoa) throw new AppError('Registro não encontrado', 404);

    // 409 e não 404: a pessoa existe, o ESTADO dela é que recusa — mesma
    // família do "esta ocupação já foi encerrada" e do "este ativo já está
    // entregue". Repetir o desligamento reescreveria `terminatedAt` e apagaria
    // a data real da saída, que é justamente o dado que a operação existe para
    // registrar.
    //
    // Isto só é seguro porque a outra ponta fechou junto: o checkout recusa
    // entregar equipamento a quem está `isActive = false`
    // (assignment/use-cases/checkout-asset.usecase.ts). Sem aquela recusa, um
    // desligado poderia voltar a acumular posse e este 409 trancaria a única
    // operação capaz de limpá-la.
    if (pessoa.terminatedAt) {
      throw new AppError('Este colaborador já foi desligado.', 409, {
        terminatedAt: pessoa.terminatedAt.toISOString(),
      });
    }

    // ── 0. TRANSFERIR AS CHEFIAS (F11, Etapa G — passo 1 do plano) ─────────
    //
    // ANTES DE TUDO, e numerado como zero porque é a única parte que pode
    // RECUSAR a operação inteira: recusar depois de devolver dez ativos faria a
    // transação voltar atrás sobre dez checkins já logados — o rollback resolve
    // o banco e não resolve o tempo de quem clicou.
    //
    // O caso com dentes é a LOCALIDADE. Pelo D27, o termo de entrega de um ativo
    // com alvo `LOCATION` vai para o gestor da localidade, encontrado subindo a
    // árvore (`resolverEscalonamento`, D139). Desligar o gestor do "Andar 2" sem
    // substituto deixa toda mesa abaixo dele sem resposta — e entregar
    // equipamento com termo de aceite naquele prédio passa a ser 409, dias
    // depois, sobre uma localidade que ninguém tocou.
    const chefias = await contarChefias(tx, userId);
    let chefiasTransferidas: ChefiasTransferidas | null = null;

    if (temChefia(chefias)) {
      if (!data.substitutoId) {
        // 409 e não 422: o corpo está válido — é o ESTADO da pessoa que exige o
        // campo. Mesma família do "ainda responde por 2 ativos" do `DELETE`.
        //
        // Os números vão nos `details` para a tela abrir o campo do substituto
        // com a lista do que vai ser transferido, sem reparsear a frase em
        // português.
        throw new AppError(motivoParaExigirSubstituto(chefias)!, 409, { ...chefias });
      }

      chefiasTransferidas = await transferirChefias(
        tx, { id: pessoa.id, name: pessoa.name }, data.substitutoId, actorId,
      );
    }

    // ── 1. DEVOLVER o que está no nome da pessoa ───────────────────────────
    //
    // Só `targetType: 'USER'`. Os ativos do POSTO NÃO são devolvidos: eles são
    // do posto, não dela — devolver o monitor da Mesa 1 porque a Laura saiu
    // tiraria da Ana, que continua trabalhando lá, um equipamento que está na
    // mesa dela (docs/MODELO-POSSE.md; é a mesma razão do D28).
    //
    // O `asset: { deletedAt: null }` é a MESMA condição do `contarPosseAberta`,
    // e as duas têm que ser a mesma: o 409 do `DELETE` conta o que esta consulta
    // fecha. Fosse diferente, um ativo na lixeira com posse aberta travaria o
    // colaborador para sempre — o 409 exigiria o desligamento, e o
    // desligamento estouraria no `update` de um ativo que a extension não
    // enxerga (P2025). A posse daquele ativo continua aberta e volta com ele,
    // se ele for restaurado.
    const abertas = await tx.assignment.findMany({
      where: { targetType: 'USER', targetUserId: userId, checkinAt: null, asset: { deletedAt: null } },
      select: { id: true, assetId: true, targetType: true, asset: { select: { statusId: true } } },
      orderBy: { checkoutAt: 'asc' },
    });

    const devolvidos: AtivoDevolvido[] = [];

    // O bloco inteiro depende de haver o que devolver — e a escolha do status
    // acontece UMA vez para o lote, dentro dele. Fora do `if`, um desligamento
    // sem ativo nenhum seria recusado com "nenhum status de estoque cadastrado":
    // um erro sobre o catálogo, numa operação que não ia tocar em ativo algum.
    if (abertas.length > 0) {
      if (data.statusId) await assertStatusExiste(tx, data.statusId);
      const statusDeVolta = data.statusId ?? (await escolherStatusPorTipo(tx, 'DEPLOYABLE', 'Disponível'));

      for (const posse of abertas) {
        // Sequencial, dentro da MESMA transação: são as três escritas do
        // checkin por ativo (`fecharPosse`), a mesma mecânica da devolução
        // avulsa. O `ActivityLog` de cada uma nasce ali dentro — por isso não
        // há um log "CHECKIN" escrito aqui.
        const { asset } = await fecharPosse(
          tx,
          {
            id: posse.id,
            assetId: posse.assetId,
            targetType: posse.targetType,
            statusAnteriorId: posse.asset.statusId,
          },
          { statusId: statusDeVolta, checkinNotes: data.notes ?? null },
          actorId,
        );

        devolvidos.push({ assignmentId: posse.id, assetId: posse.assetId, assetTag: asset.assetTag });
      }
    }

    // ── 2. DEVOLVER os ACESSÓRIOS que estão no nome da pessoa (F5) ─────────
    //
    // Mesma regra do passo 1, e a mesma armadilha: SÓ os de alvo `USER`. Os 5
    // mouses entregues à Mesa 1 NÃO voltam — eles continuam fisicamente na
    // mesa, agora com a Ana, e devolvê-los ao estoque faria o inventário mentir
    // com o saldo batendo. O `where` que impede isso está em
    // `stock/use-cases/checkin-user-accessories.usecase.ts`, com o porquê ao
    // lado.
    const acessoriosDevolvidos = await devolverAcessoriosDoUsuario(
      tx, userId, data.notes ?? null, actorId,
    );

    // ── 3. DEVOLVER os ASSENTOS DE LICENÇA da pessoa (F6) ──────────────────
    //
    // Mesma regra dos passos 1 e 2, e a mesma armadilha com um agravante: SÓ os
    // de `assignedUserId`. O assento do desktop da Mesa 1 NÃO volta — a máquina
    // continua ligada com o software instalado. Devolvê-lo faria o inventário
    // dizer que aquele assento está livre; alguém o entregaria a outra pessoa, e
    // a máquina ficaria rodando software sem licença atribuída — exposição
    // DUPLA, pior do que a do acessório, onde a unidade pelo menos fica parada
    // na mesa. O `where` que impede isso está em
    // `license/use-cases/checkin-user-seats.usecase.ts`, com o porquê ao lado.
    //
    // SEM ESTE PASSO o desligado fica com assento de licença PARA SEMPRE, e o
    // sintoma não é erro nenhum: é um número de assentos ocupados que nunca
    // desce, e a empresa comprando licença que já tem.
    const assentosDevolvidos = await devolverAssentosDoUsuario(
      tx, userId, data.notes ?? null, actorId,
    );

    // ── 4. ENCERRAR as ocupações de posto ──────────────────────────────────
    //
    // O passo com dentes. Marcar a pessoa inativa NÃO a tira da lista de
    // responsáveis da Mesa 1: `resolverResponsaveis()` lê
    // `LocationOccupant.endedAt IS NULL`, e `isActive` não aparece em lugar
    // nenhum daquela consulta. Sem este bloco, o desligamento seria cosmético.
    const ocupacoes = await tx.locationOccupant.findMany({
      where: { userId, endedAt: null },
      select: { id: true, locationId: true, shift: true, location: { select: { name: true } } },
      orderBy: { startedAt: 'asc' },
    });

    const saidaEm = new Date();
    const ocupacoesEncerradas: OcupacaoEncerrada[] = [];
    for (const ocupacao of ocupacoes) {
      await tx.locationOccupant.update({
        where: { id: ocupacao.id },
        // `endedAt` e NADA mais: a linha continua na tabela, como no
        // encerramento avulso — "quem respondia pela Mesa 1 em março?" precisa
        // continuar respondível depois da saída.
        data: { endedAt: saidaEm },
      });

      // `END`, não `DELETE`: o vínculo terminou, não foi cadastrado errado. As
      // duas palavras existem separadas no `ActivityAction` exatamente para o
      // histórico distinguir os dois eventos.
      await recordActivity(tx, {
        entityType: 'LocationOccupant',
        entityId: ocupacao.id,
        action: 'END',
        changes: {
          motivo: 'OFFBOARD',
          userId,
          locationId: ocupacao.locationId,
          shift: ocupacao.shift,
          endedAt: saidaEm.toISOString(),
        },
      }, actorId);

      ocupacoesEncerradas.push({
        id: ocupacao.id,
        locationId: ocupacao.locationId,
        locationName: ocupacao.location.name,
        shift: ocupacao.shift,
      });
    }

    // ── 5. DESLIGAR a pessoa ───────────────────────────────────────────────
    //
    // Por último de propósito: se qualquer devolução ou encerramento falhar, a
    // transação volta atrás e a pessoa NÃO fica marcada como desligada com
    // pendência aberta — o estado que faria o 409 do `DELETE` disparar sem que
    // ninguém entendesse por quê.
    // ── 6. REVOGAR O ACESSO (F11, Etapa G — passo 5 do plano) ─────────────
    //
    // DUAS COISAS, e uma delas já existia desde a F3:
    //
    // `ApiToken` pessoal → `revokedAt`. `updateMany` com `ownerType: 'USER'`
    //   porque o token de AGENTE da mesma pessoa (se ela emitiu algum) é da
    //   MÁQUINA, não dela — revogá-lo derrubaria a coleta de um computador que
    //   continua na empresa. O D80 pôs os dois na mesma tabela justamente
    //   porque o caminho de autenticação é um só; o de REVOGAÇÃO não é.
    //
    // Sessões → `tokenVersion + 1`. NÃO precisa de mecanismo novo: a F3 já
    //   assina a geração dentro do JWT e a confere contra esta coluna a cada
    //   requisição (`authenticate-request.helper.ts`). Incrementar aqui invalida,
    //   de uma vez, todo token emitido antes — sem tabela de sessão e sem lista
    //   de revogação. Quem ler "revogar sessões" do zero constrói a tabela.
    //
    // E a releitura por requisição já recusaria `isActive: false` na requisição
    // seguinte. O incremento entra porque as duas defesas respondem a coisas
    // diferentes: aquela depende de a flag estar gravada, esta mata o token em
    // si. Se um dia alguém "reativar" a pessoa sem querer, os tokens antigos
    // continuam mortos.
    const tokens = await tx.apiToken.updateMany({
      where: { ownerType: 'USER', userId, revokedAt: null },
      data: { revokedAt: saidaEm },
    });

    const desligada = await tx.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        terminatedAt: saidaEm,
        tokenVersion: { increment: 1 },
      },
      select: USER_DETAIL_SELECT,
    });

    // O log do DESLIGAMENTO em si, além dos N de checkin e dos M de END: é a
    // linha que alguém procura pelo nome da pessoa, e ela carrega o placar do
    // que a operação fechou. Sem ela, o histórico teria as consequências
    // espalhadas por duas entidades e nenhum registro do ato.
    await recordActivity(tx, {
      entityType: 'User',
      entityId: userId,
      action: 'OFFBOARD',
      changes: {
        terminatedAt: saidaEm.toISOString(),
        ativosDevolvidos: devolvidos.length,
        acessoriosDevolvidos: acessoriosDevolvidos.length,
        assentosDevolvidos: assentosDevolvidos.length,
        // O placar da PERDA, separado do da devolução: assento queimado não
        // volta ao contrato, e essa é a única linha do desligamento que custa
        // dinheiro.
        assentosQueimados: assentosDevolvidos.filter((assento) => assento.queimado).length,
        ocupacoesEncerradas: ocupacoesEncerradas.length,
        // O placar do ACESSO fechado, ao lado do da posse: "ela ainda conseguia
        // entrar?" é pergunta de auditoria, e a resposta tem que estar na linha
        // do desligamento.
        tokensRevogados: tokens.count,
        chefiasTransferidas: chefiasTransferidas ? { ...chefiasTransferidas } : null,
        notes: data.notes ?? null,
      },
    }, actorId);

    return {
      user: {
        id: desligada.id,
        name: desligada.name,
        email: desligada.email,
        isActive: desligada.isActive,
        terminatedAt: desligada.terminatedAt,
      },
      devolvidos,
      acessoriosDevolvidos,
      assentosDevolvidos,
      ocupacoesEncerradas,
      chefiasTransferidas,
      acessoRevogado: { tokens: tokens.count, sessoesDerrubadas: true },
    };
  });
}

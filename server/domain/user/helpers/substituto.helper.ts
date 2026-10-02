import { AppError } from '../../../core/errors/app-error';
import type { ClientePosse } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';

// O PASSO 1 DO DESLIGAMENTO: quem assume o que esta pessoa gere (F11, Etapa G).
//
// ═══════════════════════════════════════════════════════════════════════════
// AS TRÊS CHEFIAS, e a do meio é a que tem dentes.
//
//   gente        `User.managerId`        liderados sem gestor é um organograma
//                                        furado. Incômodo, não quebra nada.
//   LOCALIDADE   `Location.managerId`    **quebra o checkout.** Pelo D27, o
//                                        termo de entrega de um ativo com alvo
//                                        `LOCATION` vai para o gestor da
//                                        localidade, subindo a árvore
//                                        (`resolverEscalonamento`, D139). Sem
//                                        gestor em ancestral nenhum, entregar
//                                        equipamento com aceite naquele prédio
//                                        passa a ser 409.
//   departamento `Department.managerId`  relatório e rateio sem dono.
//
// O SINTOMA SEM ESTA GUARDA: ninguém percebe nada no desligamento. Dias depois,
// um checkout qualquer responde *"defina o gestor de Mesa 1"* sobre uma
// localidade que ninguém tocou — e a causa foi uma pessoa desligada na semana
// anterior, três telas de distância.
//
// POR QUE A TRANSFERÊNCIA É ATÔMICA COM O DESLIGAMENTO: ela roda DENTRO da
// transação do `offboardUser`. Em duas operações, a que falhasse no meio
// deixaria metade — e a metade ruim é a que desliga sem transferir.
// ═══════════════════════════════════════════════════════════════════════════

export interface ChefiasDaPessoa {
  liderados: number;
  localidades: number;
  departamentos: number;
}

/** Soma o que esta pessoa gere. Zero em tudo dispensa o substituto. */
export async function contarChefias(
  tx: ClientePosse,
  userId: string,
): Promise<ChefiasDaPessoa> {
  const [liderados, localidades, departamentos] = await Promise.all([
    // SÓ OS ATIVOS: um liderado já desligado não precisa de gestor novo, e
    // contá-lo exigiria substituto para transferir ninguém.
    tx.user.count({ where: { managerId: userId, isActive: true } }),
    tx.location.count({ where: { managerId: userId } }),
    tx.department.count({ where: { managerId: userId } }),
  ]);

  return { liderados, localidades, departamentos };
}

export function temChefia(chefias: ChefiasDaPessoa): boolean {
  return chefias.liderados > 0 || chefias.localidades > 0 || chefias.departamentos > 0;
}

/** "2 liderados", "1 localidade" — plural à mão, porque é uma frase. */
function quantos(total: number, singular: string, plural: string): string {
  return `${total} ${total === 1 ? singular : plural}`;
}

/**
 * A frase do 409, montada a partir das três contagens.
 *
 * Mora ao lado da contagem porque o texto e os números têm que mudar juntos —
 * a mesma razão do `motivoParaNaoExcluir` do `count-user-posse.usecase.ts`. E
 * ela NOMEIA a localidade porque é a que quebra o checkout: dizer só "gere
 * coisas" manda o operador procurar o quê.
 */
export function motivoParaExigirSubstituto(chefias: ChefiasDaPessoa): string | null {
  const partes: string[] = [];
  if (chefias.liderados > 0) partes.push(`é gestora de ${quantos(chefias.liderados, 'pessoa', 'pessoas')}`);
  if (chefias.localidades > 0) {
    partes.push(`responde por ${quantos(chefias.localidades, 'localidade', 'localidades')}`);
  }
  if (chefias.departamentos > 0) {
    partes.push(`gere ${quantos(chefias.departamentos, 'departamento', 'departamentos')}`);
  }

  if (partes.length === 0) return null;

  const frase = partes.length === 1
    ? partes[0]
    : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;

  return `Este colaborador ${frase}. Informe quem assume antes de desligar — `
    + 'localidade sem gestor torna inentregável qualquer equipamento com termo de aceite.';
}

export interface ChefiasTransferidas {
  liderados: number;
  localidades: number;
  departamentos: number;
  substitutoId: string;
  substitutoNome: string;
}

/**
 * Transfere as três chefias para o substituto, dentro da transação.
 *
 * O SUBSTITUTO É VALIDADO ANTES: tem que existir, estar ativo e não ser a
 * própria pessoa que está saindo. Os três são 422 — é o corpo que está errado,
 * não o estado.
 *
 * "Ativo" importa: transferir para alguém já desligado seria o mesmo buraco com
 * um nome diferente dentro, e o `resolverEscalonamento()` devolveria uma pessoa
 * que não atende o telefone.
 */
export async function transferirChefias(
  tx: ClientePosse,
  saindo: { id: string; name: string },
  substitutoId: string,
  actorId: string | null,
): Promise<ChefiasTransferidas> {
  if (substitutoId === saindo.id) {
    throw new AppError('O substituto não pode ser a própria pessoa que está sendo desligada.', 422);
  }

  const substituto = await tx.user.findFirst({
    where: { id: substitutoId },
    select: { id: true, name: true, isActive: true },
  });
  if (!substituto) throw new AppError('Substituto não encontrado.', 422);
  if (!substituto.isActive) {
    throw new AppError(
      `"${substituto.name}" está desligado e não pode assumir. Escolha alguém em atividade.`,
      422,
    );
  }

  const [liderados, localidades, departamentos] = await Promise.all([
    tx.user.updateMany({
      where: { managerId: saindo.id, isActive: true },
      data: { managerId: substitutoId },
    }),
    tx.location.updateMany({ where: { managerId: saindo.id }, data: { managerId: substitutoId } }),
    tx.department.updateMany({ where: { managerId: saindo.id }, data: { managerId: substitutoId } }),
  ]);

  const transferidas: ChefiasTransferidas = {
    liderados: liderados.count,
    localidades: localidades.count,
    departamentos: departamentos.count,
    substitutoId,
    substitutoNome: substituto.name,
  };

  // O log vai na linha do tempo de QUEM SAIU, e não do substituto: a pergunta
  // é "o que aconteceu quando a Laura foi desligada", e a transferência é parte
  // da resposta. O nome do substituto entra no `changes` para o histórico não
  // depender de uma segunda consulta para ser legível.
  await recordActivity(tx, {
    entityType: 'User',
    entityId: saindo.id,
    action: 'UPDATE',
    // `{ ...transferidas }` e não o objeto: o `changes` do Prisma é
    // `InputJsonValue`, que exige índice de string — uma interface nomeada não
    // o satisfaz, e espalhar produz o literal que ele aceita.
    changes: { chefiasTransferidas: { ...transferidas } },
  }, actorId);

  return transferidas;
}

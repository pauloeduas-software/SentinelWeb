import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { travarAtivoOuFalhar } from '../../asset/use-cases/lock-asset.usecase';
import {
  assertDisponivel, contarEmUsoDe, travarItemOuFalhar,
} from '../helpers/stock-balance.helper';
import { componentSpec } from '../helpers/stock-kind.helper';
import { COMPONENT_ASSET_SELECT } from '../helpers/stock-select.helper';
import type { AttachComponentData } from '../schemas/component.schema';

/**
 * A INSTALAÇÃO — a primeira ponte real entre estoque e ativo.
 *
 * Uma linha por instalação, COM quantidade: 4 pentes na mesma máquina é um fato
 * só, e é por isso que aqui existe `qty` e na entrega de acessório não. A
 * diferença é o que acontece na volta — 4 pentes saem juntos da máquina, 3
 * mouses se perdem e voltam separados.
 *
 * O ATIVO É `Asset`, e não `Endpoint`: quem recebe peça é o equipamento do
 * ITAM. A máquina descoberta pelo agente é outra tabela, e o vínculo entre as
 * duas é a F7.
 */
export async function attachComponent(
  componentId: string,
  data: AttachComponentData,
  actorId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    // A primeira trava é da linha do COMPONENTE, que é quem tem saldo disputado.
    await travarItemOuFalhar(tx, 'COMPONENT', componentSpec.rotulo, componentId);

    const componente = await tx.component.findFirst({
      where: { id: componentId },
      select: { id: true, name: true, qty: true },
    });
    if (!componente) throw new AppError('Nenhum componente com este identificador.', 404);

    // A SEGUNDA TRAVA É DO ATIVO, e ela existe por causa do 409 do
    // `deleteAsset`: ele conta as instalações abertas antes de mandar o ativo
    // para a lixeira, e sem esta trava a instalação nasceria DEPOIS daquele
    // `count` — o ativo iria para a lixeira com a peça dentro, e as unidades
    // ficariam presas sem tela que as devolvesse (`lock-asset.usecase.ts`).
    //
    // ORDEM: componente ANTES de ativo, sempre. O grafo de travas do sistema
    // continua acíclico, e inverter aqui criaria deadlock com um caminho futuro
    // que trave o ativo primeiro.
    await travarAtivoOuFalhar(tx, data.assetId);

    // `findFirst` pelo escopo da lixeira: não se instala peça num ativo
    // apagado — ele saiu do inventário, e a peça sumiria junto da vista. A
    // trava acima é sobre a LINHA e não filtra a lixeira; quem filtra é esta
    // consulta, e ela vem depois de propósito.
    const ativo = await tx.asset.findFirst({
      where: { id: data.assetId },
      select: { id: true, assetTag: true },
    });
    if (!ativo) throw new AppError('Ativo não encontrado.', 404);

    const emUso = await contarEmUsoDe(tx, 'COMPONENT', componentId);
    assertDisponivel(componentSpec.rotulo, data.qty, componente.qty, emUso);

    // UMA LINHA NOVA, mesmo que este componente já esteja neste ativo.
    //
    // Somar na linha aberta seria mais curto e apagaria a resposta de "quando
    // o segundo pente entrou nessa máquina?" — o mesmo argumento do D38, visto
    // do lado da entrada. A soma das abertas continua sendo o estado atual.
    const instalacao = await tx.componentAsset.create({
      data: {
        componentId,
        assetId: ativo.id,
        assignedQty: data.qty,
        notes: data.notes ?? null,
        attachedById: actorId,
      },
      select: COMPONENT_ASSET_SELECT,
    });

    // DOIS logs, em duas entidades, e nenhum é cópia do outro: quem abre o
    // componente quer saber para onde as unidades foram; quem abre o ativo quer
    // saber o que tem dentro dele. Sem o segundo, a aba Histórico do notebook
    // não mostraria que ganhou 16 GB de RAM.
    const changes = {
      instalacaoId: instalacao.id,
      componentId,
      assetId: ativo.id,
      assetTag: ativo.assetTag,
      qty: data.qty,
      disponivel: componente.qty - emUso - data.qty,
    };

    await recordActivity(tx, {
      entityType: componentSpec.entityType,
      entityId: componentId,
      action: 'INSTALL',
      changes,
    }, actorId);

    await recordActivity(tx, {
      entityType: 'Asset',
      entityId: ativo.id,
      action: 'INSTALL',
      changes: { ...changes, componentName: componente.name },
    }, actorId);

    return instalacao;
  });
}

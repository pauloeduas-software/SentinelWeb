import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';

/**
 * O QUE ESTÁ DENTRO DESTE ATIVO — a aba Componentes, que a F2 deixou
 * desabilitada dizendo "chega na F5".
 *
 * Só as instalações ABERTAS: a pergunta é de ESTADO ("o que tem dentro"), não
 * de histórico. O histórico das peças que passaram por aqui está na aba
 * Histórico, pelos `INSTALL`/`UNINSTALL` do `ActivityLog`.
 *
 * Uma linha por instalação, e não uma por componente: duas instalações do mesmo
 * pente em datas diferentes são dois fatos, e somá-las aqui apagaria a data de
 * entrada da segunda — que é a mesma razão do D38 vista do lado da entrada. A
 * tela soma quando quiser mostrar "32 GB".
 */
export async function listAssetComponents(assetId: string) {
  // `findFirst` pelo escopo da lixeira: ativo apagado não tem tela de detalhe.
  const ativo = await prisma.asset.findFirst({ where: { id: assetId }, select: { id: true } });
  if (!ativo) throw new AppError('Registro não encontrado', 404);

  return prisma.componentAsset.findMany({
    where: { assetId, detachedAt: null },
    select: {
      id: true,
      componentId: true,
      assignedQty: true,
      attachedAt: true,
      notes: true,
      component: {
        select: {
          id: true, name: true, serial: true, modelNumber: true,
          category: { select: { id: true, name: true, color: true } },
          manufacturer: { select: { id: true, name: true } },
        },
      },
    },
    // Mais recente primeiro: o que entrou por último é o que alguém acabou de
    // instalar e vem conferir na tela.
    orderBy: { attachedAt: 'desc' },
  });
}

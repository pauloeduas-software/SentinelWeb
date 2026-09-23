import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { ASSET_SELECT } from '../../asset/helpers/asset-select.helper';
import { WORKSTATION_DETAIL_SELECT } from '../helpers/workstation-select.helper';
import { ehPostoVago } from '../helpers/workstation-row.helper';
import { resolverCaminhos } from './resolve-location-paths.usecase';

/**
 * UM posto: quem está nele e o que foi entregue a ele.
 *
 * São as duas metades do modelo numa tela só (docs/MODELO-POSSE.md): a Camada 2
 * — os ocupantes, com turno — e a Camada 1 vista do lado do posto — as posses
 * abertas cujo alvo é esta localização. É a junção das duas que responde "quem
 * é responsável pelo mouse da Mesa 1".
 *
 * NÃO exige `isWorkstation` para responder, e isso é decisão: a marca é de
 * APRESENTAÇÃO (prisma/schema.prisma, D15) — ela separa listas, não tranca
 * leitura. Uma sala de reunião que recebeu ativo e ocupante antes de a marca
 * existir continua respondendo aqui, e `isWorkstation` sai na resposta para o
 * cliente saber qual é o caso. 404 é só para id que não existe.
 */
export async function getWorkstation(id: string) {
  // `findUnique`: `Location` não tem `deletedAt`, o catálogo não tem lixeira (D8).
  const local = await prisma.location.findUnique({
    where: { id },
    select: WORKSTATION_DETAIL_SELECT,
  });

  if (!local) throw new AppError('Posto de trabalho não encontrado.', 404);

  const [ativos, caminhos] = await Promise.all([
    // Consulta em `asset`, e não nas `assignments` do posto, de propósito: no
    // topo da consulta a `softDeleteExtension` age, e o ativo na lixeira fica
    // de fora sozinho. Lido pela relação, ele apareceria como equipamento na
    // mesa até alguém lembrar de filtrar à mão.
    prisma.asset.findMany({
      where: { assignments: { some: { targetLocationId: id, checkinAt: null } } },
      select: ASSET_SELECT,
      orderBy: { assetTag: 'asc' },
    }),
    resolverCaminhos([local.parentId]),
  ]);

  const { parentId, occupants, ...posto } = local;

  return {
    ...posto,
    caminho: parentId ? caminhos.get(parentId) ?? [] : [],

    // Os ocupantes ABERTOS saem aqui para a resposta ser completa por si: um
    // cliente que chame só esta rota precisa saber quem responde pelo posto, e
    // é deles que `vago` é derivado. A TELA de detalhe consome a rota de
    // ocupação (`/api/locations/:id/occupants`) para a mesma lista, porque lá
    // também mora o histórico e é ela que o adicionar/encerrar invalida.
    ocupantes: occupants,
    totalOcupantes: occupants.length,
    ativos,
    totalAtivos: ativos.length,
    vago: ehPostoVago(occupants.length, ativos.length),
  };
}

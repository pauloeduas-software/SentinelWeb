import { prisma } from '../../../server/core/database/prismaClient';
import { logger, type Seeder } from '../seeder';
import { mesmoNome } from './garantir-por-nome';

// ITENS DE ESTOQUE DE EXEMPLO — o que qualquer empresa tem na prateleira, como
// se tivessem acabado de ser cadastrados: ativos, com o total e sem entrega.
//
// Um ou dois por categoria de estoque e de componente (`categorias.seed.ts`),
// todos guardados no Depósito de TI.
const LOCAL = 'Depósito de TI';

const ITENS: readonly { name: string; categoria: string; qty: number }[] = [
  { name: 'Mouse USB', categoria: 'Periférico', qty: 20 },
  { name: 'Teclado USB', categoria: 'Periférico', qty: 15 },
  { name: 'Headset', categoria: 'Periférico', qty: 5 },
  { name: 'Webcam', categoria: 'Periférico', qty: 3 },
  { name: 'Monitor 24"', categoria: 'Monitor', qty: 8 },
  { name: 'Cabo HDMI', categoria: 'Cabo e adaptador', qty: 30 },
  { name: 'Adaptador USB-C para HDMI', categoria: 'Cabo e adaptador', qty: 6 },
  { name: 'Memória RAM 8 GB', categoria: 'Peça de reposição', qty: 10 },
  { name: 'SSD 480 GB', categoria: 'Peça de reposição', qty: 5 },
];

export const estoqueDemo: Seeder = {
  name: 'Estoque (demonstração)',
  run: async () => {
    // Categoria e local pelo NOME, como nos modelos: se alguém renomeou ou
    // excluiu um deles pela tela, o item é pulado com aviso.
    const local = await prisma.location.findFirst({ where: mesmoNome(LOCAL), select: { id: true } });
    let criados = 0;
    let pulados = 0;

    for (const item of ITENS) {
      const categoria = await prisma.category.findFirst({
        where: { ...mesmoNome(item.categoria), type: { in: ['STOCK', 'COMPONENT'] } },
        select: { id: true },
      });
      if (!categoria || !local) {
        pulados += 1;
        continue;
      }

      // O nome é único entre todos os itens, desativados inclusive, e sem
      // diferença de maiúscula, como a tela confere.
      const existe = await prisma.stockItem.findFirst({ where: mesmoNome(item.name), select: { id: true } });
      if (existe) continue;

      await prisma.stockItem.create({
        data: {
          name: item.name,
          qty: item.qty,
          categoryId: categoria.id,
          locationId: local.id,
        },
      });
      criados += 1;
    }

    logger.info(
      `[Seed demo] Estoque: ${criados} novos, ${ITENS.length - criados - pulados} já existiam`
        + (pulados > 0 ? `, ${pulados} pulados (categoria ou localização não encontradas).` : '.'),
    );
  },
};

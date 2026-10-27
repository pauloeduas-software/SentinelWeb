import { randomUUID } from 'node:crypto';
import { prisma } from '../../../server/core/database/prismaClient';
import { logger, type Seeder } from '../seeder';
import { mesmoNome } from './garantir-por-nome';

// LICENÇAS DE EXEMPLO — os softwares que qualquer empresa tem, como se tivessem
// acabado de ser cadastrados: ativas, sem chave e sem entrega.
//
// SEM DATA NENHUMA: sem vencimento a licença é ATIVA para sempre (D44), então
// continuam ativas em qualquer dia em que o seed rodar. Compra, valor e chave
// são dado do contrato de verdade — quem tiver o contrato preenche pela tela.
//
// SÓ A MICROSOFT TEM FABRICANTE: o seed de fabricantes é de quem faz computador
// (`fabricantes.seed.ts`), e a Microsoft está lá por causa das licenças. As
// outras ficam sem — o campo é opcional.
// Duas por categoria de licença (`categorias.seed.ts`). O WinRAR é a licença
// que ninguém compra: uma só, para a empresa inteira.
const LICENCAS: readonly { name: string; categoria: string; fabricante?: string; seatsTotal: number }[] = [
  { name: 'Windows 11 Pro', categoria: 'Sistema operacional', fabricante: 'Microsoft', seatsTotal: 20 },
  { name: 'Windows 10 Pro', categoria: 'Sistema operacional', fabricante: 'Microsoft', seatsTotal: 10 },
  { name: 'Microsoft 365', categoria: 'Produtividade', fabricante: 'Microsoft', seatsTotal: 20 },
  { name: 'WinRAR', categoria: 'Produtividade', seatsTotal: 1 },
  { name: 'Norton 360', categoria: 'Segurança', seatsTotal: 20 },
  { name: 'McAfee Total Protection', categoria: 'Segurança', seatsTotal: 10 },
  { name: 'Adobe Photoshop', categoria: 'Design', seatsTotal: 3 },
  { name: 'Canva Pro', categoria: 'Design', seatsTotal: 5 },
];

export const licencasDemo: Seeder = {
  name: 'Licenças (demonstração)',
  run: async () => {
    // Categoria e fabricante pelo NOME, como nos modelos: se alguém renomeou ou
    // excluiu um deles pela tela, a licença é pulada com aviso.
    let criadas = 0;
    let puladas = 0;

    for (const licenca of LICENCAS) {
      const [categoria, fabricante] = await Promise.all([
        prisma.category.findFirst({ where: { ...mesmoNome(licenca.categoria), type: 'LICENSE' }, select: { id: true } }),
        licenca.fabricante
          ? prisma.manufacturer.findFirst({ where: mesmoNome(licenca.fabricante), select: { id: true } })
          : null,
      ]);
      if (!categoria || (licenca.fabricante && !fabricante)) {
        puladas += 1;
        continue;
      }

      // O nome pode repetir (a renovação, AA), mas aqui é a chave da
      // idempotência: a licença que já existe fica como está.
      const existe = await prisma.license.findFirst({ where: mesmoNome(licenca.name), select: { id: true } });
      if (existe) continue;

      await prisma.license.create({
        data: {
          // Sem default no schema: o id vem da aplicação, como no cadastro.
          id: randomUUID(),
          name: licenca.name,
          seatsTotal: licenca.seatsTotal,
          categoryId: categoria.id,
          manufacturerId: fabricante?.id ?? null,
        },
      });
      criadas += 1;
    }

    logger.info(
      `[Seed demo] Licenças: ${criadas} novas, ${LICENCAS.length - criadas - puladas} já existiam`
        + (puladas > 0 ? `, ${puladas} puladas (categoria ou fabricante não encontrados).` : '.'),
    );
  },
};

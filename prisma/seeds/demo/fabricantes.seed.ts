import { prisma } from '../../../server/core/database/prismaClient';
import { logger, type Seeder } from '../seeder';
import { garantirPorNome, mesmoNome } from './garantir-por-nome';

// FABRICANTES DE COMPUTADOR comuns no Brasil — ativo é computador
// (`categorias.seed.ts`), então a lista é de quem faz notebook, desktop e
// servidor.
//
// O SITE é a página de SUPORTE, que é o que o campo pede (configuracoes.md): é
// onde se abre o chamado de garantia. Telefone e e-mail ficam vazios — mudam
// por país e por contrato, e um número inventado na ficha do ativo é pior que
// nenhum.
const FABRICANTES = [
  { name: 'Dell', url: 'https://www.dell.com/support' },
  { name: 'Lenovo', url: 'https://pcsupport.lenovo.com' },
  { name: 'Asus', url: 'https://www.asus.com/support/' },
  { name: 'Acer', url: 'https://www.acer.com' },
  { name: 'Apple', url: 'https://support.apple.com' },
  { name: 'Samsung', url: 'https://www.samsung.com/br/support/' },
  { name: 'Microsoft', url: 'https://support.microsoft.com' },
  // O COMPUTADOR MONTADO, sem marca. Fabricante explícito, e não modelo sem
  // fabricante: a regra "todo modelo tem fabricante" não ganha exceção, e
  // "todos os montados" vira um filtro. Sem site: não há a quem acionar.
  { name: 'Montado' },
] as const;

export const fabricantesDemo: Seeder = {
  name: 'Fabricantes (demonstração)',
  run: async () => {
    let criados = 0;
    for (const fabricante of FABRICANTES) {
      const criou = await garantirPorNome(
        (nome) => prisma.manufacturer.findFirst({ where: mesmoNome(nome), select: { id: true } }),
        () => prisma.manufacturer.create({ data: fabricante }),
        fabricante.name,
      );
      if (criou) criados += 1;
    }
    logger.info(`[Seed demo] Fabricantes: ${criados} novos, ${FABRICANTES.length - criados} já existiam.`);
  },
};

import { prisma } from '../../../server/infra/database/prismaClient';
import { nextAssetTag } from '../../../server/modules/settings/use-cases/app-settings.usecase';
import { logger, type Seeder } from '../seeder';
import { mesmoNome } from './garantir-por-nome';

// COMPUTADORES DE EXEMPLO, como se tivessem acabado de ser cadastrados na tela:
// Disponíveis, no Depósito de TI, à espera de entrega, e só com o que o
// formulário exige. A etiqueta é a automática, a mesma que a tela daria.
//
// Sem série, pelo motivo do número do modelo (`modelos.seed.ts`): uma série
// inventada seria o primeiro dado errado do parque.
const STATUS = 'Disponível';
const LOCAL = 'Depósito de TI';

// Um por modelo, e cinco modelos dos semeados.
const MODELOS: readonly { fabricante: string; modelo: string }[] = [
  { fabricante: 'Dell', modelo: 'Inspiron 15' },
  { fabricante: 'Lenovo', modelo: 'IdeaPad 3' },
  { fabricante: 'Asus', modelo: 'Vivobook 15' },
  { fabricante: 'Acer', modelo: 'Aspire 5' },
  { fabricante: 'Montado', modelo: 'Desktop montado' },
];

export const computadoresDemo: Seeder = {
  name: 'Computadores (demonstração)',
  run: async () => {
    const [status, local] = await Promise.all([
      prisma.statusLabel.findFirst({ where: mesmoNome(STATUS), select: { id: true } }),
      prisma.location.findFirst({ where: mesmoNome(LOCAL), select: { id: true } }),
    ]);
    let criados = 0;
    let pulados = 0;

    for (const item of MODELOS) {
      const modelo = await prisma.assetModel.findFirst({
        where: { ...mesmoNome(item.modelo), manufacturer: mesmoNome(item.fabricante) },
        select: { id: true },
      });
      if (!modelo || !status || !local) {
        pulados += 1;
        continue;
      }

      // O computador não tem nome único: a chave da idempotência é o modelo.
      // Já existindo um daquele modelo, cadastrado pela tela ou por este seed,
      // não entra outro.
      const existe = await prisma.asset.findFirst({ where: { modelId: modelo.id }, select: { id: true } });
      if (existe) continue;

      // Numa transação, como na tela: a etiqueta sai de um contador, e o número
      // volta se o cadastro falhar.
      await prisma.$transaction(async (tx) => {
        const assetTag = await nextAssetTag(tx);
        await tx.asset.create({
          data: { assetTag, modelId: modelo.id, statusId: status.id, locationId: local.id },
        });
      });
      criados += 1;
    }

    logger.info(
      `[Seed demo] Computadores: ${criados} novos, ${MODELOS.length - criados - pulados} já existiam`
        + (pulados > 0 ? `, ${pulados} pulados (modelo, status ou localização não encontrados).` : '.'),
    );
  },
};

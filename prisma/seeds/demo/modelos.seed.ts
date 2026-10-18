import { prisma } from '../../../server/core/database/prismaClient';
import { logger, type Seeder } from '../seeder';
import { mesmoNome } from './garantir-por-nome';

// MODELOS DE COMPUTADOR das linhas mais populares no Brasil, por fabricante —
// ativo é computador, então só Notebook, Desktop e Servidor.
//
// O NÚMERO DO MODELO fica vazio de propósito: cada linha tem dezenas de
// variações (por geração, processador, tela), e um número inventado
// aqui seria o primeiro dado errado do catálogo. Quem cadastrar o equipamento
// real preenche.
//
// E O MONTADO: um modelo por TIPO de máquina, não por configuração. Cada PC
// montado é diferente, e o que distingue um do outro — processador, placa de
// vídeo, disco — vai nas notas do ATIVO, ou chega sozinho pelo agente, na aba
// Máquina. Um modelo por configuração serviria a uma máquina só.

type Categoria = 'Notebook' | 'Desktop' | 'Servidor';

// Só os modelos do montado têm nota: é ela que explica, na tela, onde fica a
// configuração de cada máquina.
const NOTA_DO_MONTADO =
  'Computador montado, sem marca. A configuração de cada máquina vai nas notas do ativo, '
  + 'ou chega pelo agente, na aba Máquina.';

// UM modelo por fabricante — a linha mais popular, com nome simples — e o
// montado, o único com dois. É demonstração: o catálogo de verdade nasce do que
// a empresa compra. A Microsoft fica sem modelo (o fabricante existe para as
// licenças).
const MODELOS: readonly { fabricante: string; name: string; categoria: Categoria; notes?: string }[] = [
  { fabricante: 'Dell', name: 'Inspiron 15', categoria: 'Notebook' },
  { fabricante: 'Lenovo', name: 'IdeaPad 3', categoria: 'Notebook' },
  { fabricante: 'Asus', name: 'Vivobook 15', categoria: 'Notebook' },
  { fabricante: 'Acer', name: 'Aspire 5', categoria: 'Notebook' },
  { fabricante: 'Apple', name: 'MacBook Air', categoria: 'Notebook' },
  { fabricante: 'Samsung', name: 'Galaxy Book', categoria: 'Notebook' },

  { fabricante: 'Montado', name: 'Desktop montado', categoria: 'Desktop', notes: NOTA_DO_MONTADO },
  { fabricante: 'Montado', name: 'Servidor montado', categoria: 'Servidor', notes: NOTA_DO_MONTADO },
];

export const modelosDemo: Seeder = {
  name: 'Modelos (demonstração)',
  run: async () => {
    // Fabricante e categoria são lidos pelo NOME, sem diferença de maiúscula: o
    // seed de fabricantes roda antes, e as categorias vêm do seed principal.
    // Se alguém renomeou ou excluiu um deles pela tela, os modelos dele são
    // pulados com aviso — inventar o fabricante de volta desfaria a edição.
    let criados = 0;
    let pulados = 0;

    for (const modelo of MODELOS) {
      const [fabricante, categoria] = await Promise.all([
        prisma.manufacturer.findFirst({ where: mesmoNome(modelo.fabricante), select: { id: true } }),
        prisma.category.findFirst({ where: { ...mesmoNome(modelo.categoria), type: 'ASSET' }, select: { id: true } }),
      ]);
      if (!fabricante || !categoria) {
        pulados += 1;
        continue;
      }

      // O modelo não tem nome único (o número é que é, por fabricante), então
      // a chave da idempotência é o par fabricante + nome.
      const existe = await prisma.assetModel.findFirst({
        where: { manufacturerId: fabricante.id, ...mesmoNome(modelo.name) },
        select: { id: true },
      });
      if (existe) continue;

      await prisma.assetModel.create({
        data: {
          name: modelo.name,
          manufacturerId: fabricante.id,
          categoryId: categoria.id,
          notes: modelo.notes ?? null,
        },
      });
      criados += 1;
    }

    logger.info(
      `[Seed demo] Modelos: ${criados} novos, ${MODELOS.length - criados - pulados} já existiam`
        + (pulados > 0 ? `, ${pulados} pulados (fabricante ou categoria não encontrados).` : '.'),
    );
  },
};

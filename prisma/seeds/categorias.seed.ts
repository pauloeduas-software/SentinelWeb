import { prisma } from '../../server/core/database/prismaClient';
import type { Seeder } from './seeder';

// Conjunto mínimo para os formulários não abrirem com `<select>` vazio.
// NÃO semeamos fabricante, localização nem modelo: são dado da empresa, não do
// software — semear "Dell" é adivinhar o cliente.
//
// ATIVO É COMPUTADOR: as categorias de ativo são as de máquina — o que tem ou
// pode ter agente. Celular, tablet e impressora não entram.
// ESTOQUE é item por quantidade, sem patrimônio individual. A categoria é a
// FAMÍLIA, não o item: "Mouse" é nome de item na página de Estoque, e a
// categoria dele é "Periférico".
// COMPONENTE também é item de estoque, o que vai para dentro do computador
// (AI): a memória e o SSD, que só um computador recebe.
// LICENÇA agrupa por família de software.
const CATEGORIES = [
  { name: 'Notebook', type: 'ASSET' },
  { name: 'Desktop', type: 'ASSET' },
  { name: 'Servidor', type: 'ASSET' },

  { name: 'Periférico', type: 'STOCK' },
  { name: 'Monitor', type: 'STOCK' },
  { name: 'Cabo e adaptador', type: 'STOCK' },

  { name: 'Peça de reposição', type: 'COMPONENT' },

  { name: 'Sistema operacional', type: 'LICENSE' },
  { name: 'Produtividade', type: 'LICENSE' },
  { name: 'Segurança', type: 'LICENSE' },
  { name: 'Design', type: 'LICENSE' },
] as const;

export const categoriasSeeder: Seeder = {
  name: 'Category',
  run: async () => {
    for (const categoria of CATEGORIES) {
      // A chave é composta (`@@unique([name, type])`): "Notebook" de ATIVO e
      // "Notebook" de LICENÇA são duas linhas legítimas.
      await prisma.category.upsert({
        where: { name_type: { name: categoria.name, type: categoria.type } },
        update: {},
        create: categoria,
      });
    }
  },
};

import { prisma } from '../../../server/core/database/prismaClient';
import { logger, type Seeder } from '../seeder';
import { garantirPorNome, mesmoNome } from './garantir-por-nome';

// LOCALIZAÇÕES GERAIS de uma empresa pequena, para a tela não abrir vazia.
//
// Lista plana: o nome é quem diz onde o lugar fica (configuracoes.md). E SÓ
// localização geral — posto de trabalho se cria na tela Postos, que grava a
// marca; semear "Mesa 1" aqui seria criar uma mesa que a tela de Postos não
// mostra.
const LOCALIZACOES = [
  { name: 'Matriz' },
  // Exemplo de unidade fora da sede — a empresa renomeia com a cidade.
  { name: 'Filial' },
  // Onde fica o estoque: equipamentos à espera de entrega e itens por quantidade.
  { name: 'Depósito de TI' },
  // UMA localização para todo o home office, e não uma por casa: o endereço de
  // cada colaborador não é dado de inventário. Sem telefone nem endereço.
  { name: 'Home office' },
] as const;

export const localizacoesDemo: Seeder = {
  name: 'Localizações (demonstração)',
  run: async () => {
    let criadas = 0;
    for (const local of LOCALIZACOES) {
      const criou = await garantirPorNome(
        (nome) => prisma.location.findFirst({ where: mesmoNome(nome), select: { id: true } }),
        () => prisma.location.create({ data: local }),
        local.name,
      );
      if (criou) criadas += 1;
    }
    logger.info(`[Seed demo] Localizações: ${criadas} novas, ${LOCALIZACOES.length - criadas} já existiam.`);
  },
};

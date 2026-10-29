// Seed do banco — idempotente por construção.
//
// Só `upsert`, nunca `create`: o seed roda mais de uma vez na vida do banco
// (ambiente novo, reset local, pipeline) e não pode duplicar linha nem estourar
// em P2002 na segunda execução.
//
// `update: {}` é o detalhe que o torna seguro de rodar em banco com dado:
// garante que a linha exista sem desfazer o que alguém editou pela interface.
//
// Reaproveita o cliente do servidor de propósito, em vez de um `new PrismaClient()`
// próprio: é `getDatabaseUrl()` (server/core/config/env.ts) que remove as aspas em
// volta do valor no .env — sem ele, as aspas entrariam na connection string.
//
// Um arquivo por assunto nesta pasta; aqui só a ORDEM em que rodam.
import { pathToFileURL } from 'node:url';
import { closeDatabase } from '../../server/core/database/prismaClient';
import { logger, type Seeder } from './seeder';
import { configuracaoSeeder } from './configuracao.seed';
import { categoriasSeeder } from './categorias.seed';
import { statusSeeder } from './status.seed';

// NÃO HÁ SEED DE CONTA. O seed só cria o que o sistema precisa para funcionar
// (configuração, categorias, status); o primeiro administrador nasce pelo
// `npm run acesso:administrador`, por quem instala (AP) — uma conta semeada com
// senha de `.env` era uma porta que reabria sozinha toda vez que alguém rodava
// o seed de novo.
const seeders: Seeder[] = [
  configuracaoSeeder,
  categoriasSeeder,
  statusSeeder,
];

/**
 * Aplica todos os seeders, na ordem, e NÃO fecha o banco.
 *
 * Exportada porque o harness de teste semeia o banco a cada arquivo e precisa
 * ser ESTE seed, não uma cópia: um seed de teste próprio divergiria do de
 * produção no primeiro ajuste, e os testes passariam a provar coisa sobre um
 * catálogo que não existe em lugar nenhum.
 *
 * Quem fecha a conexão é o CHAMADOR — o teste reaproveita o mesmo cliente por
 * vários arquivos, e um `$disconnect` aqui dentro o deixaria inutilizável.
 */
export async function semearBanco(): Promise<void> {
  for (const seeder of seeders) {
    await seeder.run();
    logger.info(`[Seed] ${seeder.name}: ok.`);
  }

  logger.info(`[Seed] Concluído: ${seeders.length} ${seeders.length === 1 ? 'seeder' : 'seeders'}.`);
}

// Só quando este arquivo é o PONTO DE ENTRADA (`npm run db:seed`). Importado
// como módulo — que é o caso do harness — ele apenas oferece `semearBanco` e
// não roda nada sozinho: semear no import faria todo teste que tocasse neste
// arquivo escrever no banco antes da primeira linha do próprio teste.
const executadoDireto =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  semearBanco()
    .catch((error: unknown) => {
      // Nenhum seeder abre transação: os que já rodaram — e as linhas que o que
      // falhou chegou a gravar — continuam aplicados. Como tudo é upsert, rodar
      // de novo depois de corrigir é seguro.
      logger.error('[Seed] Falhou. Corrija e rode de novo — o seed é idempotente.', error);
      process.exitCode = 1;
    })
    .finally(closeDatabase);
}

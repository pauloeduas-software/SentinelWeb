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
import { pathToFileURL } from 'node:url';
import { prisma, closeDatabase } from '../server/core/database/prismaClient';
import { APP_SETTING_ID } from '../server/domain/settings/helpers/app-setting.helper';
import { hashSenha } from '../server/domain/auth/helpers/password.helper';
import { isProduction } from '../server/core/config/env';
import { createLogger } from '../server/core/logger/logger';

const logger = createLogger('seed');

interface Seeder {
  name: string;
  run: () => Promise<void>;
}

// Conjunto mínimo para os formulários não abrirem com `<select>` vazio.
// NÃO semeamos fabricante, localização, modelo nem STATUS: são dado da empresa,
// não do software — semear "Dell" é adivinhar o cliente. Do status o software
// só fixa o TIPO (enum `StatusLabelType`); o nome, quem cadastra é o usuário.
//
// ATIVO É COMPUTADOR: as categorias de ativo são as de máquina. Monitor e
// periférico são ESTOQUE — item por quantidade, sem patrimônio individual.
const CATEGORIES = [
  { name: 'Notebook', type: 'ASSET' },
  { name: 'Desktop', type: 'ASSET' },
  { name: 'Monitor', type: 'STOCK' },
  { name: 'Periférico', type: 'STOCK' },
  { name: 'Licença', type: 'LICENSE' },
] as const;

// O ADMINISTRADOR INICIAL — o único jeito de entrar num banco recém-criado.
//
// Depois da F3 a API é fechada por padrão: sem esta linha, ninguém loga, e sem
// login ninguém cria usuário — um ovo-e-galinha que só o seed resolve.
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME ?? 'admin').trim().toLowerCase();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@sentinel.local').trim().toLowerCase();
const ADMIN_NAME = process.env.ADMIN_NAME?.trim() || 'Administrador';

// Default SÓ para desenvolvimento, e barulhento. Senha padrão publicada num
// repositório é a porta dos fundos mais explorada que existe: em produção o
// seed PARA em vez de criar uma conta cuja senha está escrita neste arquivo.
const ADMIN_PASSWORD_PADRAO = 'sentinel-dev-2026';

function senhaDoAdmin(): string {
  const senha = process.env.ADMIN_PASSWORD?.trim();
  if (senha) return senha;

  if (isProduction) {
    throw new Error(
      'ADMIN_PASSWORD não definida. Em produção o seed não cria administrador com senha padrão. ' +
        'Defina ADMIN_PASSWORD (ex.: `openssl rand -base64 24`) e rode de novo.',
    );
  }

  logger.warn(
    `[Seed] ADMIN_PASSWORD não definida: usando a senha padrão de desenvolvimento "${ADMIN_PASSWORD_PADRAO}". ` +
      'TROQUE antes de expor este ambiente a qualquer rede.',
  );
  return ADMIN_PASSWORD_PADRAO;
}

const seeders: Seeder[] = [
  {
    // A linha de configuração global. Precisa existir antes do primeiro ativo:
    // é dela que sai o contador da etiqueta automática.
    name: 'AppSetting',
    run: async () => {
      await prisma.appSetting.upsert({
        where: { id: APP_SETTING_ID },
        update: {},
        create: { id: APP_SETTING_ID },
      });
    },
  },
  {
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
  },
  {
    // O administrador inicial. Vem por ÚLTIMO: é o único seeder que pode PARAR
    // o processo (ADMIN_PASSWORD ausente em produção), e parar depois de o
    // catálogo já estar aplicado deixa o banco utilizável para corrigir e rodar
    // de novo.
    name: 'Administrador',
    run: async () => {
      // Sem `upsert` — e isto é limitação do Prisma, não escolha: `username` e
      // `email` não são `@unique` no schema, porque a unicidade dos dois é
      // índice PARCIAL (`WHERE deletedAt IS NULL`) escrito à mão na migration.
      // `upsert` só aceita campo único conhecido pelo Prisma, então a
      // idempotência é feita aqui, com a mesma promessa: rodar de novo não
      // duplica linha e não desfaz o que alguém mudou.
      const existente = await prisma.user.findFirst({
        where: { OR: [{ username: ADMIN_USERNAME }, { email: ADMIN_EMAIL }] },
        select: { id: true, username: true, passwordHash: true },
      });

      if (existente?.passwordHash) {
        // O `update: {}` dos outros seeders, aplicado à senha: quem já trocou a
        // senha do administrador pela interface NÃO a perde ao rodar o seed de
        // novo — seria o pior tipo de "idempotência", a que reabre uma porta
        // que alguém fechou de propósito.
        logger.info(`[Seed] Administrador "${existente.username}" já existe: senha preservada.`);
        return;
      }

      const passwordHash = await hashSenha(senhaDoAdmin());

      if (existente) {
        // Cadastro que já existia sem credencial (colaborador semeado antes da
        // F3): ganha acesso em vez de virar uma segunda linha — o índice
        // parcial do e-mail recusaria a duplicata, e com razão.
        await prisma.user.update({
          where: { id: existente.id },
          data: { username: ADMIN_USERNAME, passwordHash, failedLoginCount: 0, lockedUntil: null },
        });
        logger.info(`[Seed] Credencial criada para o usuário existente "${ADMIN_USERNAME}".`);
        return;
      }

      await prisma.user.create({
        data: { name: ADMIN_NAME, email: ADMIN_EMAIL, username: ADMIN_USERNAME, passwordHash },
      });
      logger.info(`[Seed] Administrador "${ADMIN_USERNAME}" criado.`);
    },
  },
  {
    // O PAPEL DO ADMINISTRADOR — depois do usuário, porque precisa dele.
    //
    // ERA O SEEDER DO GRUPO `Administrador` (F11): ele reescrevia as permissões a
    // cada execução, porque "Administrador" quer dizer *alcança tudo* e chave nova
    // no catálogo que não chegasse aqui faria o administrador perder uma tela em
    // silêncio. Com papel (D148) não há lista a repor: `ADMIN` alcança tudo por
    // `papelAlcanca()`, e papel novo não existe sem mexer no enum.
    //
    // O seeder continua existindo porque o `.env` diz QUEM é o administrador, e
    // garantir que essa pessoa tenha o papel é o que destrava o primeiro login.
    name: 'Papel do administrador',
    run: async () => {
      // `findFirst` porque `username` não é `@unique` no Prisma (a unicidade é
      // índice parcial na migration).
      const admin = await prisma.user.findFirst({
        where: { OR: [{ username: ADMIN_USERNAME }, { email: ADMIN_EMAIL }] },
        select: { id: true, name: true, role: true },
      });

      if (!admin) {
        // Acontece quando o seeder de cima parou por falta de `ADMIN_PASSWORD`.
        // Avisa e segue: o próximo `db:seed` com a senha definida resolve.
        logger.warn('[Seed] Nenhum usuário administrador para promover.');
        return;
      }

      if (admin.role === 'ADMIN') {
        logger.info(`[Seed] "${admin.name}" já é ADMIN.`);
        return;
      }

      await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
      logger.info(`[Seed] "${admin.name}" promovido a ADMIN.`);
    },
  },
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
      // Cada seeder é uma transação própria: os que já rodaram continuam aplicados.
      // Como tudo é upsert, rodar de novo depois de corrigir é seguro.
      logger.error('[Seed] Falhou. Corrija e rode de novo — o seed é idempotente.', error);
      process.exitCode = 1;
    })
    .finally(closeDatabase);
}

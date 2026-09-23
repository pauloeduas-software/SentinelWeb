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

// Os status de fábrica, espelhando o que o Snipe-IT traz no `StatuslabelSeeder`.
//
// O `type` NÃO é enfeite: é ele que decide o que dá para fazer com o ativo.
// Só `DEPLOYABLE` libera o checkout (F4). Os cinco estão documentados no
// `enum StatusLabelType` de prisma/schema.prisma; em uma linha cada:
//
//   DEPLOYABLE   — no estoque, pode ser entregue.
//   IN_USE       — com alguém ou instalado em algum lugar.
//   PENDING      — fora do estoque por impedimento, e volta (reparo, trânsito).
//   UNDEPLOYABLE — não volta (danificado sem conserto, perdido, roubado).
//   ARCHIVED     — encerrado; sai das listagens por padrão.
//
// `IN_USE` nasceu tipo próprio depois de uma auditoria: "Em Uso" era
// `DEPLOYABLE`, o que dizia que equipamento na mão de alguém estava disponível
// para entrega. A primeira correção o moveu para `PENDING` e estava pior —
// empacotava "está com um colaborador" junto com "está na assistência", que é a
// distinção mais cara do inventário. Ver docs/AUDITORIA-F0-F1.md.
//
// `showInNav` marca os que viram atalho de filtro na interface: os do dia a dia.
//
// As cores saem dos tokens de `src/index.css`, para o catálogo nascer coerente
// com o resto do painel. Vão como hexadecimal porque o Tailwind não gera classe
// a partir de string de runtime — o frontend aplica por `style`.
const STATUS_LABELS = [
  // --- disponível para entrega ---
  { name: 'Pronto p/ Uso', type: 'DEPLOYABLE', color: '#22c55e', showInNav: true,
    notes: 'Em estoque, pronto para ser entregue a alguém.' },

  // --- cumprindo a função: fora do estoque porque está sendo usado ---
  { name: 'Em Uso', type: 'IN_USE', color: '#3b82f6', showInNav: true,
    notes: 'Com um colaborador ou instalado em uma localização. Volta ao estoque na devolução.' },

  // --- fora do estoque por impedimento, mas volta ---
  { name: 'Aguardando', type: 'PENDING', color: '#f59e0b', showInNav: false,
    notes: 'Comprado ou recebido, ainda não preparado para uso.' },
  { name: 'Em Diagnóstico', type: 'PENDING', color: '#f59e0b', showInNav: false,
    notes: 'Enviado para avaliação técnica; ainda não se sabe se tem conserto.' },
  { name: 'Manutenção', type: 'PENDING', color: '#f59e0b', showInNav: true,
    notes: 'Em reparo. Volta para o estoque quando terminar.' },

  // --- não volta ---
  { name: 'Danificado', type: 'UNDEPLOYABLE', color: '#ef4444', showInNav: true,
    notes: 'Sem conserto viável. Candidato a descarte.' },
  { name: 'Perdido / Roubado', type: 'UNDEPLOYABLE', color: '#ef4444', showInNav: false,
    notes: 'Extraviado ou furtado. Mantido no inventário para a trilha de auditoria.' },

  // --- encerrado ---
  { name: 'Arquivado', type: 'ARCHIVED', color: '#888888', showInNav: false,
    notes: 'Fora de operação e fora das listagens do dia a dia.' },
] as const;

// Conjunto mínimo para o formulário de ativo não abrir com `<select>` vazio.
// NÃO semeamos fabricante, fornecedor, localização, modelo nem depreciação: são
// dado da empresa, não do software — semear "Dell" é adivinhar o cliente.
const CATEGORIES = [
  { name: 'Notebook', type: 'ASSET', color: '#3b82f6' },
  { name: 'Desktop', type: 'ASSET', color: '#3b82f6' },
  { name: 'Monitor', type: 'ASSET', color: '#888888' },
  { name: 'Periférico', type: 'ASSET', color: '#888888' },
  { name: 'Licença', type: 'LICENSE', color: '#f59e0b' },

  // ESTOQUE (F5). Uma por tipo, e o TIPO é o que decide em qual das três abas a
  // categoria aparece: o use-case recusa um acessório de categoria `ASSET`, e
  // sem estas linhas a primeira tela de estoque de um banco novo abriria sem
  // nenhuma categoria selecionável.
  { name: 'Acessório', type: 'ACCESSORY', color: '#14b8a6' },
  { name: 'Consumível', type: 'CONSUMABLE', color: '#a855f7' },
  { name: 'Componente', type: 'COMPONENT', color: '#0ea5e9' },
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
    name: 'StatusLabel',
    run: async () => {
      for (const status of STATUS_LABELS) {
        await prisma.statusLabel.upsert({
          where: { name: status.name },
          update: {},
          create: status,
        });
      }
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

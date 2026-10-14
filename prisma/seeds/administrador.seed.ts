import { prisma } from '../../server/core/database/prismaClient';
import { hashSenha } from '../../server/domain/auth/helpers/password.helper';
import { isProduction } from '../../server/core/config/env';
import { logger, type Seeder } from './seeder';

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

// Roda depois do catálogo: é o único seeder que pode PARAR o processo
// (ADMIN_PASSWORD ausente em produção), e parar depois de o catálogo já estar
// aplicado deixa o banco utilizável para corrigir e rodar de novo.
export const administradorSeeder: Seeder = {
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
};

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
export const papelDoAdministradorSeeder: Seeder = {
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
};

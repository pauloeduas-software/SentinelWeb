-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_GroupToUser" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_name_key" ON "groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_GroupToUser_AB_unique" ON "_GroupToUser"("A", "B");

-- CreateIndex
CREATE INDEX "_GroupToUser_B_index" ON "_GroupToUser"("B");

-- AddForeignKey
ALTER TABLE "_GroupToUser" ADD CONSTRAINT "_GroupToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupToUser" ADD CONSTRAINT "_GroupToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ═══════════════════════════════════════════════════════════════════════════
-- O BACKFILL — escrito à mão, porque o `migrate diff` não gera DML.
--
-- O PROBLEMA QUE ELE RESOLVE: a partir do commit que acompanha esta migração,
-- toda rota exige uma chave de permissão, e permissão efetiva é a união das
-- permissões dos grupos da pessoa (D76). Sem backfill, no instante do deploy
-- **ninguém tem grupo nenhum** — ou seja, ninguém alcança nada, inclusive quem
-- precisaria entrar para distribuir os acessos. O sistema subiria trancado, e a
-- saída seria psql ou restauração de backup.
--
-- A DECISÃO, E ELA É DE SEGURANÇA: todo usuário que HOJE consegue fazer login
-- (tem `passwordHash`) entra no grupo `Administrador`.
--
-- Parece largo e é exatamente o estado atual preservado: antes desta fase não
-- existe autorização nenhuma — qualquer sessão válida faz qualquer coisa. Dar a
-- essas pessoas todas as chaves não concede nada que elas já não tivessem; o que
-- muda é que agora isso está ESCRITO num grupo, visível numa tela, e removível.
--
-- A alternativa — só o administrador do seed entra — parece mais segura e é pior
-- na prática: ela DERRUBA o acesso de todo mundo num deploy, sem aviso, e a
-- recuperação depende de alguém com acesso ao banco. Entre "mantém o que havia e
-- deixa o operador restringir" e "tranca todos e espera socorro", a primeira é a
-- que não exige plantão.
--
-- Quem não tem `passwordHash` NÃO entra: são os colaboradores cadastrados só
-- para receber equipamento (a base nasceu sem login — ver `User.username` no
-- schema). Eles não entram no sistema hoje e continuam não entrando.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO "groups" ("id", "name", "description", "permissions", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'Administrador',
  'Acesso total. Criado pela migração da F11 e mantido em dia pelo seed.',
  -- O CONJUNTO COMPLETO DO CATÁLOGO, literal, UMA vez.
  --
  -- Ele é duplicata de `access/helpers/permission-catalog.ts`, e o jeito de a
  -- duplicata não envelhecer é o seed: `prisma/seed.ts` reescreve as permissões
  -- deste grupo a partir do catálogo em CÓDIGO a cada execução, então chave nova
  -- chega aqui sozinha. Este literal existe só para o intervalo entre
  -- `migrate deploy` e o primeiro `db:seed` — sem ele, esse intervalo é um
  -- sistema trancado.
  --
  -- `tests/invariantes/permissao.test.ts` confere que o grupo tem exatamente as
  -- chaves do catálogo depois do seed, que é o que impede a deriva silenciosa.
  '{
    "access.manage": true,
    "assets.view": true, "assets.create": true, "assets.edit": true,
    "assets.delete": true, "assets.checkout": true, "assets.viewCost": true,
    "assets.audit": true, "assets.maintain": true,
    "licenses.view": true, "licenses.create": true, "licenses.edit": true,
    "licenses.delete": true, "licenses.checkout": true, "licenses.viewKey": true,
    "stock.view": true, "stock.create": true, "stock.edit": true,
    "stock.delete": true, "stock.checkout": true,
    "users.view": true, "users.create": true, "users.edit": true,
    "users.delete": true, "users.offboard": true,
    "endpoints.view": true, "endpoints.command": true,
    "catalog.manage": true,
    "reports.view": true, "reports.export": true,
    "settings.manage": true, "labels.print": true, "imports.manage": true,
    "backup.download": true
  }'::jsonb,
  now(), now()
)
-- `ON CONFLICT` porque o seed pode ter rodado antes desta migração num banco
-- montado fora de ordem. Reaplicar a migração não pode estourar.
ON CONFLICT ("name") DO NOTHING;

-- Quem já consegue entrar hoje vai para o grupo. `ON CONFLICT DO NOTHING` pelo
-- índice único do par: rodar duas vezes não duplica o vínculo.
INSERT INTO "_GroupToUser" ("A", "B")
SELECT g."id", u."id"
  FROM "groups" g
  CROSS JOIN "users" u
 WHERE g."name" = 'Administrador'
   AND u."passwordHash" IS NOT NULL
   AND u."deletedAt" IS NULL
ON CONFLICT ("A", "B") DO NOTHING;

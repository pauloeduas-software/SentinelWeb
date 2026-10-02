-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false;


-- O `Administrador` criado pela migração anterior é de sistema: as permissões
-- dele são do CÓDIGO (`access/helpers/permission-catalog.ts`), reconciliadas
-- pelo seed, e a rota de edição recusa alterá-las. Ver o comentário da coluna no
-- schema — a flag existe para o seed poder reescrever sem desfazer decisão de
-- ninguém.
UPDATE "groups" SET "isSystem" = true WHERE "name" = 'Administrador';

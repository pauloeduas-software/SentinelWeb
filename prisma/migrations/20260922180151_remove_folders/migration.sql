-- DropForeignKey
ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_folderId_fkey";

-- AlterTable
ALTER TABLE "assets" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "inventory_items" DROP COLUMN "folderId",
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "telemetries" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;

-- DropTable
DROP TABLE "folders";


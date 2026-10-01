-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "backupRetentionDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "companyName" TEXT NOT NULL DEFAULT 'Minha Empresa',
ADD COLUMN     "csvDelimiter" TEXT NOT NULL DEFAULT ';',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'BRL',
ADD COLUMN     "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
ADD COLUMN     "faviconPath" TEXT,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'pt-BR',
ADD COLUMN     "logoPath" TEXT,
ADD COLUMN     "primaryColor" TEXT NOT NULL DEFAULT '#ededed';


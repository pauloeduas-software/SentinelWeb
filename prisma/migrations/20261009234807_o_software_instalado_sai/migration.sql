-- O SOFTWARE INSTALADO SAI, E COM ELE A CONFORMIDADE DE LICENÇA.
--
-- Saem o catálogo normalizado (`software_packages`), as instalações por máquina
-- (`software_installations`), a ponte licença↔pacote (`license_software`) e as
-- três colunas do endpoint que alimentavam a normalização: o JSON cru que o
-- agente manda e os dois sha256 que diziam se havia o que normalizar.
--
-- A ORDEM DO DROP SEGUE AS FKs, embora aqui ela não precise: `license_software`
-- e `software_installations` apontam para `software_packages` (a segunda com
-- `ON DELETE RESTRICT`), e o Prisma derruba as quatro FKs antes dos `DROP
-- TABLE` — então neste script nenhuma ordem falharia. A ordem é a do desenho,
-- para quem ler saber qual tabela depende de qual.
--
-- Nenhum índice PARCIAL escrito à mão cita estas tabelas ou colunas, então aqui
-- não há o par DROP/CREATE que a migration da observação de usuário precisou.
--
-- O protocolo do agente NÃO muda: `HandshakeData.installedSoftware` continua no
-- tipo e no parser. O servidor só para de gravar.

-- DropForeignKey
ALTER TABLE "license_software" DROP CONSTRAINT "license_software_licenseId_fkey";

-- DropForeignKey
ALTER TABLE "license_software" DROP CONSTRAINT "license_software_packageId_fkey";

-- DropForeignKey
ALTER TABLE "software_installations" DROP CONSTRAINT "software_installations_endpointId_fkey";

-- DropForeignKey
ALTER TABLE "software_installations" DROP CONSTRAINT "software_installations_packageId_fkey";

-- AlterTable
ALTER TABLE "endpoints" DROP COLUMN "installedSoftware",
DROP COLUMN "softwareHash",
DROP COLUMN "softwareNormalizedHash";

-- DropTable
DROP TABLE "license_software";

-- DropTable
DROP TABLE "software_installations";

-- DropTable
DROP TABLE "software_packages";

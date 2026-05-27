-- CreateEnum
CREATE TYPE "TipoEscala" AS ENUM ('SEMANAL', 'ALTERNADA');

-- AlterTable
ALTER TABLE "Horario" ADD COLUMN     "tipoEscala" "TipoEscala" NOT NULL DEFAULT 'SEMANAL';

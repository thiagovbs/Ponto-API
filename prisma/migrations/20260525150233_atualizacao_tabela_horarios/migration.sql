-- AlterTable
ALTER TABLE "horarios" ADD COLUMN     "domingoInicioImpar" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "trabalhaDomingoAlt" BOOLEAN NOT NULL DEFAULT false;

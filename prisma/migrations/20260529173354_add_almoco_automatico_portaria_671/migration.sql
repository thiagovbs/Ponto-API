-- AlterTable
ALTER TABLE "Horario" ADD COLUMN     "duracaoAlmocoMinutos" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "utiliza_almoco_automatico" BOOLEAN NOT NULL DEFAULT true;

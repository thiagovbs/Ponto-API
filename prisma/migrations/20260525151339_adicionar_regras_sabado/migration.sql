-- AlterTable
ALTER TABLE "horarios" ADD COLUMN     "horaEntradaSabado" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "horaSaidaSabado" TEXT NOT NULL DEFAULT '12:00',
ADD COLUMN     "trabalhaSabado" BOOLEAN NOT NULL DEFAULT false;

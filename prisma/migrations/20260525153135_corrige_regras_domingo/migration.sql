/*
  Warnings:

  - You are about to drop the `horarios` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_horarioBaseId_fkey";

-- DropTable
DROP TABLE "horarios";

-- CreateTable
CREATE TABLE "Horario" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "horaEntradaPadrao" TEXT NOT NULL DEFAULT '08:00',
    "horaSaidaPadrao" TEXT NOT NULL DEFAULT '17:00',
    "trabalhaSabado" BOOLEAN NOT NULL DEFAULT false,
    "horaEntradaSabado" TEXT NOT NULL DEFAULT '08:00',
    "horaSaidaSabado" TEXT NOT NULL DEFAULT '12:00',
    "trabalhaDomingo" BOOLEAN NOT NULL DEFAULT false,
    "horaEntradaDomingo" TEXT NOT NULL DEFAULT '08:00',
    "horaSaidaDomingo" TEXT NOT NULL DEFAULT '12:00',
    "trabalhaDomingoAlt" BOOLEAN NOT NULL DEFAULT false,
    "domingoInicioImpar" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Horario_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_horarioBaseId_fkey" FOREIGN KEY ("horarioBaseId") REFERENCES "Horario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

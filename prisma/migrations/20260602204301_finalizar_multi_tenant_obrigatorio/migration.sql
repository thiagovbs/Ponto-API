/*
  Warnings:

  - Made the column `empresa_id` on table `afastamentos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `empresa_id` on table `batidas_ponto` required. This step will fail if there are existing NULL values in that column.
  - Made the column `setor_id` on table `batidas_ponto` required. This step will fail if there are existing NULL values in that column.
  - Made the column `empresa_id` on table `usuarios` required. This step will fail if there are existing NULL values in that column.
  - Made the column `filial_id` on table `usuarios` required. This step will fail if there are existing NULL values in that column.
  - Made the column `setor_id` on table `usuarios` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "afastamentos" ALTER COLUMN "empresa_id" SET NOT NULL,
ALTER COLUMN "empresa_id" SET DEFAULT 'id-empresa-padrao';

-- AlterTable
ALTER TABLE "batidas_ponto" ALTER COLUMN "empresa_id" SET NOT NULL,
ALTER COLUMN "empresa_id" SET DEFAULT 'id-empresa-padrao',
ALTER COLUMN "setor_id" SET NOT NULL,
ALTER COLUMN "setor_id" SET DEFAULT 'id-setor-padrao';

-- AlterTable
ALTER TABLE "usuarios" ALTER COLUMN "empresa_id" SET NOT NULL,
ALTER COLUMN "empresa_id" SET DEFAULT 'id-empresa-padrao',
ALTER COLUMN "filial_id" SET NOT NULL,
ALTER COLUMN "filial_id" SET DEFAULT 'id-filial-padrao',
ALTER COLUMN "setor_id" SET NOT NULL,
ALTER COLUMN "setor_id" SET DEFAULT 'id-setor-padrao';

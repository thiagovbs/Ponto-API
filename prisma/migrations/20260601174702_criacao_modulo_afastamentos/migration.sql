-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'FUNCIONARIO');

-- CreateEnum
CREATE TYPE "TipoEscala" AS ENUM ('SEMANAL', 'ALTERNADA');

-- CreateEnum
CREATE TYPE "TipoAfastamento" AS ENUM ('FERIAS', 'ATESTADO_MEDICO', 'LICENCA_MATERNIDADE', 'LICENCA_PATERNIDADE', 'AFASTAMENTO_INSS', 'OUTROS');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL DEFAULT 'FUNCIONARIO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "data_inicio_escala" TIMESTAMP(3),
    "horario_base_id" TEXT,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Horario" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo_escala" "TipoEscala" NOT NULL DEFAULT 'SEMANAL',
    "utiliza_almoco_automatico" BOOLEAN NOT NULL DEFAULT true,
    "duracao_almoco_minutos" INTEGER NOT NULL DEFAULT 60,
    "hora_entrada_padrao" TEXT NOT NULL DEFAULT '08:00',
    "hora_saida_padrao" TEXT NOT NULL DEFAULT '17:00',
    "trabalha_sabado" BOOLEAN NOT NULL DEFAULT false,
    "hora_entrada_sabado" TEXT NOT NULL DEFAULT '08:00',
    "hora_saida_sabado" TEXT NOT NULL DEFAULT '12:00',
    "trabalha_domingo" BOOLEAN NOT NULL DEFAULT false,
    "hora_entrada_domingo" TEXT NOT NULL DEFAULT '08:00',
    "hora_saida_domingo" TEXT NOT NULL DEFAULT '12:00',
    "trabalha_domingo_alt" BOOLEAN NOT NULL DEFAULT false,
    "domingo_inicio_impar" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batidas_ponto" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "data_hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "foto_base64" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batidas_ponto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_modificacoes_ponto" (
    "id" TEXT NOT NULL,
    "batida_ponto_id" TEXT NOT NULL,
    "data_hora_anterior" TIMESTAMP(3) NOT NULL,
    "data_hora_nova" TIMESTAMP(3) NOT NULL,
    "justificativa" TEXT NOT NULL,
    "alterado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_modificacoes_ponto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_auditoria" (
    "id" TEXT NOT NULL,
    "usuario_acao_id" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "dados_anteriores" JSONB,
    "dados_novos" JSONB,
    "ip_origem" TEXT,
    "data_hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "afastamentos" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tipo" "TipoAfastamento" NOT NULL DEFAULT 'FERIAS',
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3) NOT NULL,
    "justificativa" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "afastamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_cpf_key" ON "usuarios"("cpf");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_horario_base_id_fkey" FOREIGN KEY ("horario_base_id") REFERENCES "Horario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batidas_ponto" ADD CONSTRAINT "batidas_ponto_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_usuario_acao_id_fkey" FOREIGN KEY ("usuario_acao_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afastamentos" ADD CONSTRAINT "afastamentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

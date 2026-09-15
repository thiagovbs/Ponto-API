import 'dotenv/config'; // Garante a leitura do arquivo .env
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg'; // Importação do driver nativo do Postgres para gerenciar pool
import { PrismaPg } from '@prisma/adapter-pg';

// 1. Captura a URL do banco de dados
const connectionString = process.env.DATABASE_URL;

// Trava de segurança para garantir que a URL existe antes de ligar o servidor
if (!connectionString) {
  throw new Error('❌ FATAL: A variável DATABASE_URL não foi encontrada. Verifique o arquivo .env.');
}

// 2. Inicializa o Pool do Postgres (Gerenciamento inteligente de conexões abertas)
const pool = new Pool({ connectionString });

// 3. Passa o pool de conexões para o Adapter do Prisma
const adapter = new PrismaPg(pool);

// 4. Inicializa o cliente base do Prisma usando o driver do PG
const prismaBase = new PrismaClient({adapter});

// 5. Cliente exportado
//
// Havia aqui uma extensao que interceptava toda escrita e gravava LogAuditoria
// automaticamente. Foi removida porque duplicava, com dados piores, o que os
// controllers ja registram:
//
//   - nao tinha autor (usuarioAcaoId nunca era preenchido) nem IP de origem;
//   - nao tinha o estado anterior, apenas o `data` da operacao;
//   - gravava esse `data` cru, o que incluia senhaHash;
//   - rodava fora da transacao, entao uma falha ao gravar o log deixava a
//     operacao ja efetivada sem rastro.
//
// Toda escrita passa a ser registrada explicitamente pelo controller, na mesma
// transacao da operacao, com autor, IP e estado anterior. Uma escrita nova sem
// log explicito fica sem auditoria: gravar o log faz parte de escrever a
// operacao.
export const prisma = prismaBase;

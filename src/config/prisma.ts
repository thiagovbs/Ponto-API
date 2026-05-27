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

// 5. Extensão de Auditoria Automática Unificada
export const prisma = prismaBase.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);

        // Intercepta apenas operações de escrita no banco (CUD)
        if (['create', 'update', 'delete', 'upsert'].includes(operation)) {
          // Ignora a própria tabela de log para evitar um loop infinito
          if (model !== 'LogAuditoria') {
            await prismaBase.logAuditoria.create({
              data: {
                acao: operation.toUpperCase(),
                entidade: model,
                dadosNovos: operation !== 'delete' ? ((args as any)?.data) : null,
                // O usuarioAcaoId pode ser mapeado aqui no futuro se injetado no contexto
              },
            });
          }
        }
        return result;
      },
    },
  },
});
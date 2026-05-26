const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');

// 1. Configura o pool e o adapter exigido pelo construtor do Prisma 7
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

// 2. Inicializa o cliente passando estritamente o 'adapter' permitido
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 [SEED] Iniciando inserção do usuário Admin inicial...');

  const cpfAdmin = '00000000000'; 
  const senhaTextoPlano = 'Admin123@';

  // Criptografa a senha usando o bcrypt nativo
  const senhaHash = await bcrypt.hash(senhaTextoPlano, 10);

  // Executa o upsert no banco Postgres
  const admin = await prisma.usuario.upsert({
    where: { cpf: cpfAdmin },
    update: {}, 
    create: {
      nome: 'Administrador Inicial',
      cpf: cpfAdmin,
      senhaHash: senhaHash,
      perfil: 'ADMIN',
    },
  });

  console.log(`\n✅ [SEED] Sucesso! Usuário "${admin.nome}" pronto para uso.`);
  console.log(`📌 CPF: ${admin.cpf} | Senha: ${senhaTextoPlano}\n`);
}

main()
  .catch((e) => {
    console.error('❌ [SEED] Erro fatal durante a execução:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end(); // Encerra o pool de conexões do PG
    console.log('🔌 [SEED] Conexão com o banco encerrada.');
  });
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

  console.log('🌱 Iniciando semeadura do banco de dados (Seed)...');

  // 1. Criar a Empresa Mãe (Seu primeiro cliente vendido)
  const empresa = await prisma.empresa.upsert({
    where: { cnpj: '00.000.000/0001-00' },
    update: {},
    create: {
      id: 'id-empresa-padrao',
      razaoSocial: 'Thiago CORP',
      cnpj: '00.000.000/0001-00',
      tokenTotem: 'totem-token-cliente-um',
    },
  });
  console.log(`🏢 Empresa padrão garantida: ${empresa.razaoSocial}`);

  // 2. Criar a Filial Matriz
  const filial = await prisma.filial.upsert({
    where: { id: 'id-filial-padrao' },
    update: {},
    create: {
      id: 'id-filial-padrao',
      nome: 'Matriz Central',
      cnpj: '00.000.000/0001-00',
      empresaId: empresa.id,
    },
  });
  console.log(`📍 Filial padrão garantida: ${filial.nome}`);

  // 3. Criar o Setor solicitado
  const setor = await prisma.setor.upsert({
    where: { id: 'id-setor-padrao' },
    update: {},
    create: {
      id: 'id-setor-padrao',
      nome: 'Geral',
      empresaId: empresa.id,
      filialId: filial.id,
    },
  });
  console.log(`📁 Setor padrão garantido: ${setor.nome}`);

  // 4. Gerar o Hash da senha para o Administrador Inicial
  // 🔒 Mude a senha abaixo para a senha master que você desejar usar no primeiro acesso
  const senhaMaster = 'Admin123@'; 
  const salt = await bcrypt.genSalt(10);
  const senhaHash = await bcrypt.hash(senhaMaster, salt);

  // 5. Criar o Usuário Administrador amarrado ao fuso corporativo da Empresa Inicial
  const adminCpf = '00000000000'; // 🔒 Insira o CPF do Admin aqui (apenas números)
  
  const admin = await prisma.usuario.upsert({
    where: { cpf: adminCpf },
    update: {
      senhaHash: senhaHash,
      empresaId: empresa.id,
      filialId: filial.id,
      setorId: setor.id,
      perfil: 'SUPER_ADMIN' // 🟢 Corrigido: Passado como String para o JavaScript puro
    },
    create: {
      nome: 'Administrador Geral SaaS',
      cpf: adminCpf,
      senhaHash: senhaHash,
      perfil: 'SUPER_ADMIN', // 🟢 Corrigido: Passado como String para o JavaScript puro
      empresaId: empresa.id,
      filialId: filial.id,
      setorId: setor.id
    },
  });
  console.log(`👤 Usuário SUPER_ADMIN criado/atualizado com sucesso! CPF: ${admin.cpf}`);
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
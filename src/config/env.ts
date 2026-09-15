import 'dotenv/config'; // Garante a leitura do arquivo .env

// 1. Captura o segredo de assinatura dos tokens
const jwtSecret = process.env.JWT_SECRET?.trim();

// Trava de segurança no mesmo espírito da que existe em config/prisma.ts para
// a DATABASE_URL. Sem ela, a ausência da variável não derrubava nada: cinco
// pontos do código caíam em um segredo escrito no fonte ('fallback_secret' em
// quatro deles, 'sua_chave_secreta_aqui' no quinto), e a aplicação subia
// assinando tokens que qualquer um poderia forjar.
//
// A divergência entre os dois valores era um segundo defeito: um token emitido
// no login não validava na rota de usuários, porque cada lado usava um segredo
// diferente.
if (!jwtSecret) {
  throw new Error(
    '❌ FATAL: A variável JWT_SECRET não foi encontrada (ou está vazia). ' +
      'Defina um valor longo e aleatório antes de subir a aplicação.'
  );
}

export const JWT_SECRET = jwtSecret;

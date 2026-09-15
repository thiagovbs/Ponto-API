import { Router, Request, Response, NextFunction } from 'express';
import { UsuarioController } from '../controllers/usuario.controller';
import { prisma } from '../config/prisma';
import jwt from 'jsonwebtoken';
import { AuthMiddleware, PERFIL_TOTEM } from '../middlewares/auth.middleware';

const usuarioRoutes = Router();

// MIDDLEWARE DE CONVIVÊNCIA DA ABORDAGEM A COMPLETO
const verificarTokenOuTotem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const totemHeader = req.headers['x-totem-token'];

    // 1. Cenário A: Painel Administrativo Web (Possui JWT Bearer Token)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const tokenJWT = authHeader.split(' ')[1];
      const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_aqui';
      
      const decodificado = jwt.verify(tokenJWT, JWT_SECRET) as any;
      req.usuario = { id: decodificado.id, perfil: decodificado.perfil };
      req.empresaId = decodificado.empresaId;
      
      return next();
    }

    // 2. Cenário B: Aplicativo Totem Mobile / Postman (Possui Cabeçalho x-totem-token)
    if (totemHeader) {
      const tokenTotemStr = (Array.isArray(totemHeader) ? totemHeader[0] : String(totemHeader)).trim();

      const empresaVinculada = await prisma.empresa.findFirst({
        where: { tokenTotem: tokenTotemStr }
      });

      if (!empresaVinculada) {
        res.status(401).json({ erro: 'Acesso negado. Token do Totem inválido ou revogado.' });
        return;
      }

      // Escopo proprio do dispositivo. O totem precisa apenas LER a lista de
      // funcionarios para montar a tela de selecao; escrita em usuarios exige
      // ADMIN, conforme declarado nas rotas abaixo.
      req.usuario = {
        id: `TOTEM_SISTEMA_${empresaVinculada.id}`,
        perfil: PERFIL_TOTEM
      };
      
      req.empresaId = empresaVinculada.id;
      return next();
    }

    res.status(401).json({ erro: 'Autenticação necessária. Envie o token JWT ou o token do Totem da empresa.' });
    return;
  } catch (erro) {
    res.status(401).json({ erro: 'Credenciais inválidas ou expiradas.' });
    return;
  }
};

// ROTAS CONFIGURADAS COM PROTEÇÃO HÍBRIDA
// Somente leitura para o totem: e disso que o tablet da portaria precisa para
// montar a lista de funcionarios. O proprio controller ja restringe o retorno
// a perfil FUNCIONARIO da empresa do dispositivo.
usuarioRoutes.get(
  '/',
  verificarTokenOuTotem,
  AuthMiddleware.permitirPerfis('SUPER_ADMIN', 'ADMIN', PERFIL_TOTEM),
  UsuarioController.listarUsuarios
);

// Escrita em usuarios e exclusiva de administradores autenticados por JWT.
const somenteAdmin = AuthMiddleware.permitirPerfis('SUPER_ADMIN', 'ADMIN');

usuarioRoutes.post('/', verificarTokenOuTotem, somenteAdmin, UsuarioController.criarUsuario);
usuarioRoutes.put('/:id', verificarTokenOuTotem, somenteAdmin, UsuarioController.atualizarUsuario);
usuarioRoutes.delete('/:id', verificarTokenOuTotem, somenteAdmin, UsuarioController.excluirUsuario);

export { usuarioRoutes };
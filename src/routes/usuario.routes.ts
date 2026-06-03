import { Router, Request, Response, NextFunction } from 'express';
import { UsuarioController } from '../controllers/usuario.controller';
import { prisma } from '../config/prisma';
import jwt from 'jsonwebtoken';

const usuarioRoutes = Router();

// 🟢 MIDDLEWARE DE CONVIVÊNCIA DA ABORDAGEM A: Autentica via JWT ou via Token de Identificação do Totem
const verificarTokenOuTotem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const totemHeader = req.headers['x-totem-token'];

    // 1. Cenário A: Requisição vinda do Painel Administrativo Web (Possui JWT Bearer Token)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const tokenJWT = authHeader.split(' ')[1];
      const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_aqui';
      
      const decodificado = jwt.verify(tokenJWT, JWT_SECRET) as any;
      req.usuario = { id: decodificado.id, perfil: decodificado.perfil };
      req.empresaId = decodificado.empresaId;
      
      return next();
    }

    // 2. Cenário B: Requisição vinda do Aplicativo Totem Mobile (Possui Cabeçalho customizado x-totem-token)
    if (totemHeader) {
      const tokenTotemStr = String(totemHeader).trim();

      // Busca no banco PostgreSQL se existe alguma empresa vinculada a este hash de portaria
      const empresaVinculada = await prisma.empresa.findFirst({
        where: { tokenTotem: tokenTotemStr }
      });

      if (!empresaVinculada) {
        res.status(401).json({ erro: 'Acesso negado. Token do Totem inválido ou revogado.' });
        return;
      }

      // Injeta o escopo multi-tenant na requisição para blindar a busca do controller
      req.empresaId = empresaVinculada.id;
      return next();
    }

    // Se nenhum dos cabeçalhos de validação estiver presente, barra o acesso
    res.status(401).json({ erro: 'Autenticação necessária. Envie o token JWT ou o token do Totem da empresa.' });
    return;
  } catch (erro) {
    res.status(401).json({ erro: 'Credenciais inválidas ou expiradas.' });
    return;
  }
};

// 🟢 ROTAS CONFIGURADAS COM PROTEÇÃO HÍBRIDA
usuarioRoutes.post('/', verificarTokenOuTotem, UsuarioController.criarUsuario);
usuarioRoutes.get('/', verificarTokenOuTotem, UsuarioController.listarUsuarios); // A listagem agora aceita o Totem!
usuarioRoutes.put('/:id', verificarTokenOuTotem, UsuarioController.atualizarUsuario);
usuarioRoutes.delete('/:id', verificarTokenOuTotem, UsuarioController.excluirUsuario);

export { usuarioRoutes };
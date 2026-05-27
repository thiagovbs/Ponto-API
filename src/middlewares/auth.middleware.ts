import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// 🛡️ DECLARAÇÃO GLOBAL: Adiciona a propriedade 'usuario' diretamente no Request do Express
declare global {
  namespace Express {
    interface Request {
      usuario?: {
        id: string;
        perfil: string;
      };
    }
  }
}

export const AuthMiddleware = {
  // Middleware 1: Verifica se o usuário está logado (Token Válido)
  verificarToken(req: Request, res: Response, next: NextFunction): void { // 🪛 Mudou para Request nativo
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ erro: 'Acesso negado. Token não fornecido.' });
      return;
    }

    const [, token] = authHeader.split(' ');

    try {
      const secret = process.env.JWT_SECRET || 'fallback_secret';
      
      const decoded = jwt.verify(token, secret) as { id: string, perfil: string };
      
      req.usuario = decoded;
      
      next();
    } catch (error) {
      res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
  },

  // Middleware 2: Verifica se o usuário tem permissão de Administrador
  verificarAdmin(req: Request, res: Response, next: NextFunction): void { // 🪛 Mudou para Request nativo
    if (req.usuario?.perfil !== 'ADMIN') {
      res.status(403).json({ erro: 'Acesso restrito. Apenas administradores podem executar esta ação.' });
      return;
    }
    
    next();
  }
};
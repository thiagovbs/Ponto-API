import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Estendemos a interface padrão do Express para injetar os dados do usuário na requisição
export interface AuthRequest extends Request {
  usuario?: {
    id: string;
    perfil: string;
  };
}

export const AuthMiddleware = {
  // Middleware 1: Verifica se o usuário está logado (Token Válido)
  verificarToken(req: AuthRequest, res: Response, next: NextFunction): void {
    // @ts-ignore
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ erro: 'Acesso negado. Token não fornecido.' });
      return;
    }

    // O padrão é "Bearer <token>", então dividimos a string
    const [, token] = authHeader.split(' ');

    try {
      const secret = process.env.JWT_SECRET || 'fallback_secret';
      
      // Decodifica o token e extrai o Payload
      const decoded = jwt.verify(token, secret) as { id: string, perfil: string };
      
      // Injeta os dados decodificados dentro do 'req' para a próxima rota utilizar
      req.usuario = decoded;
      
      next(); // Continua o fluxo
    } catch (error) {
      res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
  },

  // Middleware 2: Verifica se o usuário tem permissão de Administrador
  verificarAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
    if (req.usuario?.perfil !== 'ADMIN') {
      res.status(403).json({ erro: 'Acesso restrito. Apenas administradores podem executar esta ação.' });
      return;
    }
    
    next();
  }
};
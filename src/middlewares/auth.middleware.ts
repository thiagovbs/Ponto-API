import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env';

/**
 * Perfis reconhecidos na autorizacao.
 *
 * TOTEM nao existe no enum do banco: e um escopo de execucao atribuido ao
 * tablet da portaria, que se autentica pelo header x-totem-token e nao
 * corresponde a nenhum usuario. Antes o totem recebia perfil ADMIN "para
 * passar pelas checagens internas", o que lhe dava poder de criar, alterar e
 * excluir usuarios -- inclusive um SUPER_ADMIN, que atravessa o isolamento
 * entre empresas.
 */
export type PerfilAutorizacao = 'SUPER_ADMIN' | 'ADMIN' | 'FUNCIONARIO' | 'TOTEM';

export const PERFIL_TOTEM: PerfilAutorizacao = 'TOTEM';

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
      const secret = JWT_SECRET;
      
      const decoded = jwt.verify(token, secret) as { id: string, perfil: string };
      
      req.usuario = decoded;
      
      next();
    } catch (error) {
      res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
  },

  /**
   * Autoriza apenas os perfis informados. Cada rota declara explicitamente
   * quem pode executa-la, em vez de depender de um perfil injetado para
   * "passar pelas checagens".
   */
  permitirPerfis(...permitidos: PerfilAutorizacao[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const perfil = req.usuario?.perfil as PerfilAutorizacao | undefined;

      if (!perfil || !permitidos.includes(perfil)) {
        res.status(403).json({
          erro: 'Acesso negado. Esta operação não é permitida para o seu perfil.',
        });
        return;
      }

      next();
    };
  },

  // Middleware 2: Verifica se o usuário tem permissão de Administrador
  verificarAdmin(req: Request, res: Response, next: NextFunction): void { // 🪛 Mudou para Request nativo
    const perfil = req.usuario?.perfil as String;

    if (perfil !== "ADMIN" && perfil !== "SUPER_ADMIN") {
      res.status(403).json({ erro: 'Acesso restrito. Apenas administradores podem executar esta ação.' });
      return;
    }
    
    next();
  }
};
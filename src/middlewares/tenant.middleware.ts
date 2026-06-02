import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const perfil = req.usuario?.perfil as String;
  if (perfil !== 'SUPER_ADMIN'){  
    try {
      // 1. Recupera o token JWT enviado no cabeçalho Authorization
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).json({ erro: 'Acesso negado: Token de autenticação ausente.' });
      }

      // O formato padrão do header é "Bearer TOKEN_STRING"
      const partes = authHeader.split(' ');
      if (partes.length !== 2 || partes[0] !== 'Bearer') {
        return res.status(401).json({ erro: 'Acesso negado: Formato do token inválido.' });
      }

      const token = partes[1];
      const secret = process.env.JWT_SECRET || 'fallback_secret';

      // 2. Descriptografa e valida a assinatura do Token
      const decodificado = jwt.verify(token, secret) as {
        id: string;
        perfil: string;
        empresaId: string; // 🔒 A nossa chave multi-tenant criptografada
      };

      // 3. Injeta as credenciais validadas no escopo da requisição do Express
      req.usuario = { id: decodificado.id, perfil: decodificado.perfil }; // Se já tiver, reafirma o ID
      req.empresaId = decodificado.empresaId; // 🔒 O controller lerá direto daqui!

      // Segue adiante com total segurança de isolamento
      next();
    } catch (error) {
      console.error('Erro na validação do Tenant Token:', error);
      return res.status(401).json({ erro: 'Sessão inválida ou expirada. Efetue login novamente.' });
    }
  }  
}
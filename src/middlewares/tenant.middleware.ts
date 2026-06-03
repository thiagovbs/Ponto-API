import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma'; // 🟢 INJETADO: Prisma para validar o token do tablet inline

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const perfil = req.usuario?.perfil as string;
  const totemHeader = req.headers['x-totem-token'];
  
  // 🟢 CORREÇÃO CRÍTICA: Se for um SUPER_ADMIN global puro, ignora o isolamento por tenant e prossegue
  if (perfil === 'SUPER_ADMIN'){  
    return next();
  }

  // 🟢 NOVA TRAVA HÍBRIDA DA ABORDAGEM A: Se for uma requisição vinda do Totem Mobile da portaria
  if (totemHeader) {
    try {
      const tokenTotemStr = (Array.isArray(totemHeader) ? totemHeader[0] : String(totemHeader)).trim();
      
      if (!tokenTotemStr || tokenTotemStr === 'undefined' || tokenTotemStr === 'null') {
        return res.status(401).json({ erro: 'Acesso negado: Token do Totem inválido.' });
      }

      // Busca a empresa diretamente para isolar o escopo da organização
      const empresaVinculada = await prisma.empresa.findFirst({
        where: { tokenTotem: tokenTotemStr }
      });

      if (!empresaVinculada) {
        return res.status(401).json({ erro: 'Acesso negado: Empresa ou Token de identificação não localizados.' });
      }

      // Injeta os escopos virtuais exigidos pelas camadas superiores de controllers e logs
      req.empresaId = empresaVinculada.id;
      req.usuario = { id: `TOTEM_SISTEMA_${empresaVinculada.id}`, perfil: 'ADMIN' };

      console.log(`📡 [Tenant Middleware] Totem autenticado com sucesso para: ${empresaVinculada.razaoSocial}`);
      return next(); // Porteira aberta com segurança!
    } catch (error) {
      console.error('Erro na validação do Token do Totem no middleware:', error);
      return res.status(500).json({ erro: 'Erro interno ao validar credenciais do dispositivo.' });
    }
  }

  // 🔒 FLUXO PADRÃO ORIGINAL: Validação via JWT (Painel Web Administrador)
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ erro: 'Acesso negado: Token de autenticação ausente.' });
    }

    const partes = authHeader.split(' ');
    if (partes.length !== 2 || partes[0] !== 'Bearer') {
      return res.status(401).json({ erro: 'Acesso negado: Formato do token inválido.' });
    }

    const token = partes[1];
    const secret = process.env.JWT_SECRET || 'fallback_secret';

    const decodificado = jwt.verify(token, secret) as {
      id: string;
      perfil: string;
      empresaId: string;
    };

    req.usuario = { id: decodificado.id, perfil: decodificado.perfil };
    req.empresaId = decodificado.empresaId;

    return next();
  } catch (error) {
    console.error('Erro na validação do Tenant Token JWT:', error);
    return res.status(401).json({ erro: 'Sessão inválida ou expirada. Efetue login novamente.' });
  }
}
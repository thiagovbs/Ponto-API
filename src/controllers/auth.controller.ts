import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const AuthController = {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { cpf, senha } = req.body;

      if (!cpf || !senha) {
        res.status(400).json({ erro: 'CPF e senha são obrigatórios.' });
        return;
      }

      // 1. Busca o usuário pelo CPF
      const usuario = await prisma.usuario.findUnique({
        where: { cpf }
      });

      if (!usuario) {
        res.status(401).json({ erro: 'Credenciais inválidas.' });
        return;
      }

      // 2. Compara a senha enviada com o hash salvo no banco
      const senhaValida = await bcrypt.compare(senha, usuario.senhaHash);

      if (!senhaValida) {
        res.status(401).json({ erro: 'Credenciais inválidas.' });
        return;
      }

      // 3. Inclui o 'empresaId' dentro do Token JWT
      const secret = process.env.JWT_SECRET || 'fallback_secret';
      const token = jwt.sign(
        { 
          id: usuario.id, 
          perfil: usuario.perfil,
          empresaId: usuario.empresaId
        },
        secret,
        { expiresIn: '1d' }
      );

      const { senhaHash: _, ...usuarioSemSenha } = usuario;

      res.status(200).json({
        mensagem: 'Login realizado com sucesso',
        token,
        usuario: usuarioSemSenha
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Erro interno no servidor de autenticação.' });
    }
  },

  // 👁️ NOVO MÉTODO: MODO PERSONIFICAÇÃO (GHOST MODE)
  async personificarEmpresa(req: Request, res: Response): Promise<void> {
    try {
      // 🔒 Segurança Máxima: Apenas um SUPER_ADMIN real (extraído do token original) pode personificar
      if (req.usuario?.perfil !== 'SUPER_ADMIN') {
        res.status(403).json({ erro: 'Acesso negado. Rota restrita ao administrador global da plataforma.' });
        return;
      }

      const { empresaIdAlvo } = req.body;

      if (!empresaIdAlvo) {
        res.status(400).json({ erro: 'O ID da empresa alvo é obrigatório para personificação.' });
        return;
      }

      // Verifica se a empresa realmente existe no SaaS
      const empresaExiste = await prisma.empresa.findUnique({
        where: { id: empresaIdAlvo }
      });

      if (!empresaExiste) {
        res.status(404).json({ erro: 'Empresa alvo não encontrada no ecossistema.' });
        return;
      }

      // Busca o administrador mestre nativo daquela empresa para herdarmos os vínculos estruturais
      const adminNativo = await prisma.usuario.findFirst({
        where: { 
          empresaId: empresaIdAlvo,
          perfil: 'ADMIN'
        }
      });

      const secret = process.env.JWT_SECRET || 'fallback_secret';

      // Gera um token JWT modificado com o escopo da empresa alvo
      const tokenPersonificado = jwt.sign(
        { 
          id: req.usuario.id, // Mantém o ID do Super Admin para fins de Log/Auditoria se necessário
          perfil: 'ADMIN',    // Engana o ecossistema rebaixando temporariamente para ADMIN da empresa dele
          empresaId: empresaIdAlvo, // Injeta o Tenant Isolado do cliente
          filialId: adminNativo?.filialId || null,
          setorId: adminNativo?.setorId || null,
          isPersonificado: true // Flag salvadora para o frontend saber que está em suporte
        },
        secret,
        { expiresIn: '2h' } // Token mais curto por segurança de suporte
      );

      res.status(200).json({
        mensagem: `Personificação ativa com sucesso para a empresa: ${empresaExiste.razaoSocial}`,
        token: tokenPersonificado
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Falha crítica ao gerar token de personificação.' });
    }
  }
};
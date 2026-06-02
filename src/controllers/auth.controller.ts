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

      // 1. Busca o usuário pelo CPF (O Prisma trará o empresaId associado a ele)
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

      // 3. 🟢 ATUALIZADO: Inclui o 'empresaId' dentro do Token JWT
      // Isso blinda a aplicação caso o usuário tente burlar o cabeçalho manualmente,
      // permitindo que o middleware opte por ler diretamente do Token descriptografado!
      const secret = process.env.JWT_SECRET || 'fallback_secret';
      const token = jwt.sign(
        { 
          id: usuario.id, 
          perfil: usuario.perfil,
          empresaId: usuario.empresaId // 🔒 Token agora carrega a identidade corporativa
        },
        secret,
        { expiresIn: '1d' }
      );

      // 4. Remove a senha para o retorno
      const { senhaHash: _, ...usuarioSemSenha } = usuario;

      // 5. 🟢 ATUALIZADO: O retorno agora entrega explicitamente o empresaId para a Web
      res.status(200).json({
        mensagem: 'Login realizado com sucesso',
        token,
        usuario: usuarioSemSenha // 🏢 Já inclui id, nome, perfil, empresaId, filialId, etc.
      });

    } catch (error) {
      console.error('Erro no login:', error);
      res.status(500).json({ erro: 'Erro interno no servidor.' });
    }
  }
};
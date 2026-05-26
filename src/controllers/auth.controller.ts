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
        res.status(401).json({ erro: 'Credenciais inválidas.' }); // Usamos mensagens genéricas por segurança
        return;
      }

      // 2. Compara a senha enviada com o hash salvo no banco
      const senhaValida = await bcrypt.compare(senha, usuario.senhaHash);

      if (!senhaValida) {
        res.status(401).json({ erro: 'Credenciais inválidas.' });
        return;
      }

      // 3. Gera o Token JWT com o ID e o Perfil do usuário (para uso nos middlewares)
      const secret = process.env.JWT_SECRET || 'fallback_secret';
      const token = jwt.sign(
        { id: usuario.id, perfil: usuario.perfil },
        secret,
        { expiresIn: '1d' } // O token expira em 1 dia
      );

      // 4. Remove a senha para o retorno
      const { senhaHash: _, ...usuarioSemSenha } = usuario;

      res.status(200).json({
        mensagem: 'Login realizado com sucesso',
        token,
        usuario: usuarioSemSenha
      });

    } catch (error) {
      console.error('Erro no login:', error);
      res.status(500).json({ erro: 'Erro interno no servidor.' });
    }
  }
};
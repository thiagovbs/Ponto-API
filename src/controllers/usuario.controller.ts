import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import bcrypt from 'bcrypt';

export const UsuarioController = {
  async criarUsuario(req: Request, res: Response): Promise<void> {
    try {
      const { nome, cpf, senha, perfil, horarioBaseId } = req.body;

      // 1. Validação básica
      if (!nome || !cpf || !senha) {
        res.status(400).json({ erro: 'Nome, CPF e senha são obrigatórios.' });
        return;
      }

      // 2. Verifica se o CPF já está cadastrado
      const usuarioExistente = await prisma.usuario.findUnique({
        where: { cpf }
      });

      if (usuarioExistente) {
        res.status(409).json({ erro: 'Já existe um usuário cadastrado com este CPF.' });
        return;
      }

      // 3. Criptografa a senha (o número 10 é o "salt rounds", um bom padrão de segurança)
      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(senha, salt);

      // 4. Salva no banco de dados
      const novoUsuario = await prisma.usuario.create({
        data: {
          nome,
          cpf,
          senhaHash,
          perfil: perfil || 'FUNCIONARIO', // Define FUNCIONARIO como padrão se não for enviado
          horarioBaseId: horarioBaseId || null,
        }
      });

      // 5. Remove a senha do objeto de retorno por segurança
      const { senhaHash: _, ...usuarioSemSenha } = novoUsuario;

      res.status(201).json({
        mensagem: 'Usuário cadastrado com sucesso!',
        usuario: usuarioSemSenha
      });

    } catch (error) {
      console.error('Erro ao cadastrar usuário:', error);
      res.status(500).json({ erro: 'Erro interno no servidor ao cadastrar usuário.' });
    }
  },

  async listarUsuarios(req: Request, res: Response): Promise<void> {
    try {
      const usuarios = await prisma.usuario.findMany({
        select: {
          id: true,
          nome: true,
          cpf: true,
          perfil: true,
          horarioBaseId: true,
          createdAt: true,
        },
        orderBy: { nome: 'asc' } // Ordena alfabeticamente
      });

      res.status(200).json(usuarios);
    } catch (error) {
      console.error('Erro ao listar usuários:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar usuários.' });
    }
  },

   async atualizarUsuario(req: Request, res: Response) {
    const { id } = req.params;
    const { nome, cpf, perfil, senha } = req.body;

    try {
      // 1. Criamos o objeto com os dados básicos que sempre serão atualizados
      const dadosAtualizacao: any = {
        nome,
        cpf,
        perfil
      };

      // 2. Verifica se uma nova senha foi enviada
      if (senha && senha.trim() !== '') {
        // Se a senha foi preenchida, gera o novo Hash antes de salvar
        const salt = await bcrypt.genSalt(10);
        dadosAtualizacao.senhaHash = await bcrypt.hash(senha, salt);
      }

      // 3. Executa o update no banco passando apenas o que mudou
      const usuarioAtualizado = await prisma.usuario.update({
        where: { id },
        data: dadosAtualizacao,
        select: { id: true, nome: true, cpf: true, perfil: true } // Não retorna a senha no JSON
      });

      return res.json(usuarioAtualizado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ erro: 'Erro ao atualizar o usuário.' });
    }
  }

};
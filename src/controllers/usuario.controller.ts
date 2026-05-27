import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import bcrypt from 'bcrypt';

export const UsuarioController = {
  async criarUsuario(req: Request, res: Response): Promise<void> {
    try {
      const { nome, cpf, senha, perfil, horarioBaseId } = req.body;
      
      const administradorId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress; // 🪛 Captura o IP de origem do admin [cite: 10]

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

      // 3. Criptografa a senha [cite: 1]
      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(senha, salt);

      // 4. Salva no banco de dados e registra a auditoria usando uma Transação
      const [novoUsuario] = await prisma.$transaction([
        prisma.usuario.create({
          data: {
            nome,
            cpf,
            senhaHash,
            perfil: perfil || 'FUNCIONARIO',
            horarioBaseId: horarioBaseId || null,
          }
        }),
        
        // 🛡️ GRAVAÇÃO COMPATÍVEL COM O SEU SCHEMA.PRISMA 
        prisma.logAuditoria.create({
          data: {
            acao: 'CREATE', // Padrão recomendado pelo seu schema comment 
            entidade: 'Usuario', // Campo obrigatório identificado 
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null, // Rastreabilidade preenchida [cite: 10]
            dadosAnteriores: {}, // Sem dados anteriores por ser criação [cite: 8]
            dadosNovos: { // Estado completo do novo usuário salvo como JSON legítimo [cite: 9]
              nome,
              cpf,
              perfil: perfil || 'FUNCIONARIO',
              horarioBaseId: horarioBaseId || null
            }
          }
        })
      ]);

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
        orderBy: { nome: 'asc' }
      });

      res.status(200).json(usuarios);
    } catch (error) {
      console.error('Erro ao listar usuários:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar usuários.' });
    }
  },

  async atualizarUsuario(req: Request, res: Response): Promise<any> {
    const { id } = req.params;
    const { nome, cpf, perfil, senha, horarioBaseId } = req.body;
    
    const administradorId = req.usuario?.id;
    const ip = req.ip || req.socket.remoteAddress;

    try {
      // 1. Busca o estado atual do usuário ANTES da alteração (Essencial para a sua auditoria) 
      const usuarioAntes = await prisma.usuario.findUnique({
        where: { id },
        select: { nome: true, cpf: true, perfil: true, horarioBaseId: true }
      });

      if (!usuarioAntes) {
        return res.status(404).json({ erro: 'Usuário não encontrado.' });
      }

      // 2. Monta os dados básicos de atualização
      const dadosAtualizacao: any = {
        nome,
        cpf,
        perfil,
        horarioBaseId: horarioBaseId || null
      };

      if (senha && senha.trim() !== '') {
        const salt = await bcrypt.genSalt(10);
        dadosAtualizacao.senhaHash = await bcrypt.hash(senha, salt);
      }

      // 3. Executa a atualização e a auditoria de forma atômica
      const [usuarioAtualizado] = await prisma.$transaction([
        prisma.usuario.update({
          where: { id },
          data: dadosAtualizacao,
          select: { id: true, nome: true, cpf: true, perfil: true, horarioBaseId: true }
        }),

        // 🛡️ GRAVAÇÃO COMPATÍVEL COM O SEU SCHEMA.PRISMA 
        prisma.logAuditoria.create({
          data: {
            acao: 'UPDATE', 
            entidade: 'Usuario',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            // Comparamos o estado do objeto antes e depois da modificação perfeitamente 
            dadosAnteriores: usuarioAntes as any, // Capturado antes do update [cite: 8]
            dadosNovos: { // Novo estado pós update [cite: 9]
              nome,
              cpf,
              perfil,
              horarioBaseId: horarioBaseId || null
            }
          }
        })
      ]);

      return res.json(usuarioAtualizado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ erro: 'Erro ao atualizar o usuário.' });
    }
  }
};
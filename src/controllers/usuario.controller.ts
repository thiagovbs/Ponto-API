import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import bcrypt from 'bcrypt';

export const UsuarioController = {
  // 1. CADASTRAR NOVO USUÁRIO (ATUALIZADO)
  async criarUsuario(req: Request, res: Response): Promise<void> {
    try {
      // 🔹 Adicionado 'dataInicioEscala' na desestruturação do corpo
      const { nome, cpf, senha, perfil, horarioBaseId, dataInicioEscala } = req.body;
      
      const administradorId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      // Validação básica
      if (!nome || !cpf || !senha) {
        res.status(400).json({ erro: 'Nome, CPF e senha são obrigatórios.' });
        return;
      }

      // Verifica se o CPF já está cadastrado
      const usuarioExistente = await prisma.usuario.findUnique({
        where: { cpf }
      });

      if (usuarioExistente) {
        res.status(409).json({ erro: 'Já existe um usuário cadastrado com este CPF.' });
        return;
      }

      // Criptografa a senha
      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(senha, salt);

      // 🔹 Estruturação dos dados respeitando as regras do Perfil
      const dadosCriacao: any = {
        nome,
        cpf,
        senha: senhaHash,
        perfil,
        horarioBaseId: perfil === 'FUNCIONARIO' && horarioBaseId ? horarioBaseId : null,
        // 🔥 Salva o campo novo convertendo para Date se houver valor
        dataInicioEscala: perfil === 'FUNCIONARIO' && dataInicioEscala ? new Date(dataInicioEscala) : null
      };

      // Salva no banco de dados e registra a auditoria usando uma Transação
      const [novoUsuario] = await prisma.$transaction([
        prisma.usuario.create({
          data: dadosCriacao,
          select: { id: true, nome: true, cpf: true, perfil: true, horarioBaseId: true, dataInicioEscala: true }
        }),

        prisma.logAuditoria.create({
          data: {
            acao: 'CREATE',
            entidade: 'Usuario',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: null,
            dadosNovos: {
              nome,
              cpf,
              perfil,
              horarioBaseId: perfil === 'FUNCIONARIO' && horarioBaseId ? horarioBaseId : null,
              dataInicioEscala: perfil === 'FUNCIONARIO' && dataInicioEscala ? dataInicioEscala : null
            }
          }
        })
      ]);

      res.status(201).json(novoUsuario);
    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Erro interno ao cadastrar colaborador.' });
    }
  },

  // 2. ATUALIZAR DADOS DO USUÁRIO (ATUALIZADO)
  async atualizarUsuario(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // 🔹 Captura o novo campo vindo da requisição (req.body)
      const { nome, cpf, senha, perfil, horarioBaseId, dataInicioEscala } = req.body;
      
      const administradorId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      // 1. Busca o estado atual do usuário antes de atualizar (para alimentar a auditoria)
      const usuarioAntes = await prisma.usuario.findUnique({
        where: { id },
        select: { id: true, nome: true, cpf: true, perfil: true, horarioBaseId: true, dataInicioEscala: true }
      });

      if (!usuarioAntes) {
        res.status(404).json({ erro: 'Usuário não encontrado.' });
        return;
      }

      // 2. Monta o objeto de alteração dinamicamente
      const dadosAtualizacao: any = {
        nome,
        cpf,
        perfil,
        horarioBaseId: perfil === 'FUNCIONARIO' && horarioBaseId ? horarioBaseId : null,
        // 🔥 OBRIGATÓRIO: Repassa o campo mapeado do Front-end para salvar no banco
        dataInicioEscala: perfil === 'FUNCIONARIO' && dataInicioEscala ? new Date(dataInicioEscala) : null
      };

      if (senha && senha.trim() !== '') {
        const salt = await bcrypt.genSalt(10);
        dadosAtualizacao.senha = await bcrypt.hash(senha, salt);
      }

      // 3. Executa a atualização e a auditoria de forma atômica
      const [usuarioAtualizado] = await prisma.$transaction([
        prisma.usuario.update({
          where: { id },
          data: dadosAtualizacao,
          select: { id: true, nome: true, cpf: true, perfil: true, horarioBaseId: true, dataInicioEscala: true }
        }),

        prisma.logAuditoria.create({
          data: {
            acao: 'UPDATE', 
            entidade: 'Usuario',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: usuarioAntes as any, 
            dadosNovos: { 
              nome,
              cpf,
              perfil,
              horarioBaseId: perfil === 'FUNCIONARIO' && horarioBaseId ? horarioBaseId : null,
              dataInicioEscala: perfil === 'FUNCIONARIO' && dataInicioEscala ? dataInicioEscala : null
            }
          }
        })
      ]);

      res.status(200).json(usuarioAtualizado);
    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Erro interno ao atualizar colaborador.' });
    }
  },

  // 3. REMOVER USUÁRIO DO SISTEMA (MANTIDO)
  async excluirUsuario(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const administradorId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      const usuarioAntes = await prisma.usuario.findUnique({
        where: { id }
      });

      if (!usuarioAntes) {
        res.status(404).json({ erro: 'Usuário não encontrado.' });
        return;
      }

      await prisma.$transaction([
        prisma.usuario.delete({
          where: { id }
        }),
        prisma.logAuditoria.create({
          data: {
            acao: 'DELETE',
            entidade: 'Usuario',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: usuarioAntes as any,
            dadosNovos: null
          }
        })
      ]);

      res.status(200).json({ mensagem: 'Usuário removido com sucesso.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Erro interno ao excluir colaborador.' });
    }
  },

  // 4. LISTAR TODOS OS USUÁRIOS (MANTIDO)
  async listarUsuarios(req: Request, res: Response): Promise<void> {
    try {
      const usuarios = await prisma.usuario.findMany({
        orderBy: { nome: 'asc' },
        select: {
          id: true,
          nome: true,
          cpf: true,
          perfil: true,
          horarioBaseId: true,
          dataInicioEscala: true // Incluído por padrão no select geral
        }
      });
      res.status(200).json(usuarios);
    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Erro interno ao listar colaboradores.' });
    }
  }
};
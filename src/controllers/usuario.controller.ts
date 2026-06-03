import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import bcrypt from 'bcrypt';

export const UsuarioController = {
  async criarUsuario(req: Request, res: Response): Promise<void> {
    try {
      const { empresaId } = req;
      const { nome, cpf, senha, perfil, horarioBaseId, dataInicioEscala, filialId, setorId } = req.body;
      
      const administradorId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      if (!nome || !cpf || !senha || !filialId || !setorId) {
        res.status(400).json({ erro: 'Nome, CPF, senha, filial e setor são obrigatórios.' });
        return;
      }

      const usuarioExistente = await prisma.usuario.findUnique({
        where: { cpf }
      });

      if (usuarioExistente) {
        res.status(409).json({ erro: 'Já existe um usuário cadastrado com este CPF.' });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(senha, salt);

      const dadosCriacao: any = {
        nome,
        cpf,
        senhaHash: senhaHash,
        perfil,
        empresaId: empresaId!, 
        filialId,
        setorId,
        horarioBaseId: perfil === 'FUNCIONARIO' && horarioBaseId ? horarioBaseId : null,
        dataInicioEscala: perfil === 'FUNCIONARIO' && dataInicioEscala ? new Date(dataInicioEscala) : null
      };

      const [novoUsuario] = await prisma.$transaction([
        prisma.usuario.create({
          data: dadosCriacao,
          select: { id: true, nome: true, cpf: true, perfil: true, horarioBaseId: true, dataInicioEscala: true, filialId: true, setorId: true }
        }),

        prisma.logAuditoria.create({
          data: {
            acao: 'CREATE',
            entidade: 'Usuario',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: null,
            dadosNovos: {
              empresaId,
              nome,
              cpf,
              perfil,
              filialId,
              setorId,
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

  async atualizarUsuario(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { empresaId } = req;
      const { nome, cpf, senha, perfil, horarioBaseId, dataInicioEscala, filialId, setorId } = req.body;
      
      const administradorId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      const usuarioAntes = await prisma.usuario.findFirst({
        where: { id, empresaId: empresaId },
        select: { id: true, nome: true, cpf: true, perfil: true, horarioBaseId: true, dataInicioEscala: true, filialId: true, setorId: true }
      });

      if (!usuarioAntes) {
        res.status(404).json({ erro: 'Usuário não encontrado.' });
        return;
      }

      const dadosAtualizacao: any = {
        nome,
        cpf,
        perfil,
        filialId,
        setorId,
        horarioBaseId: perfil === 'FUNCIONARIO' && horarioBaseId ? horarioBaseId : null,
        dataInicioEscala: perfil === 'FUNCIONARIO' && dataInicioEscala ? new Date(dataInicioEscala) : null
      };

      if (senha && senha.trim() !== '') {
        const salt = await bcrypt.genSalt(10);
        dadosAtualizacao.senhaHash = await bcrypt.hash(senha, salt);
      }

      // 🟢 FIXADO: Corrigido o acesso ao modelo adicionando 'prisma.usuario.update' para sanar o erro TS2339
      const [usuarioAtualizado] = await prisma.$transaction([
        prisma.usuario.update({
          where: { id },
          data: dadosAtualizacao,
          select: { id: true, nome: true, cpf: true, perfil: true, horarioBaseId: true, dataInicioEscala: true, filialId: true, setorId: true }
        }),

        prisma.logAuditoria.create({
          data: {
            acao: 'UPDATE', 
            entidade: 'Usuario',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: usuarioAntes as any, 
            dadosNovos: { 
              empresaId,
              nome,
              cpf,
              perfil,
              filialId,
              setorId,
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

  async excluirUsuario(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { empresaId } = req;
      const administradorId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      const usuarioAntes = await prisma.usuario.findFirst({
        where: { id, empresaId: empresaId }
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
            dadosAnteriores: { id: usuarioAntes.id, nome: usuarioAntes.nome, empresaId } as any,
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

  async listarUsuarios(req: Request, res: Response): Promise<void> {
    try {
      let empresaIdEfetivo = req.empresaId;
      const totemHeader = req.headers['x-totem-token'];

      // Camada de escape seguro para revalidação inline do token do totem
      if (!empresaIdEfetivo && totemHeader) {
        const tokenTotemStr = (Array.isArray(totemHeader) ? totemHeader[0] : String(totemHeader)).trim();
        const empresaDispositivo = await prisma.empresa.findFirst({
          where: { tokenTotem: tokenTotemStr }
        });
        if (empresaDispositivo) {
          empresaIdEfetivo = empresaDispositivo.id;
        }
      }

      if (!empresaIdEfetivo) {
        res.status(401).json({ erro: 'Não foi possível isolar o escopo da organização (Tenant ID ausente).' });
        return;
      }

      // Filtragem de segurança MTE para o Totem listar apenas perfis de colaboradores funcionais
      const usuarios = await prisma.usuario.findMany({
        where: {
          empresaId: empresaIdEfetivo,
          perfil: 'FUNCIONARIO'
        },
        orderBy: { nome: 'asc' },
        select: {
          id: true,
          nome: true,
          cpf: true,
          perfil: true,
          horarioBaseId: true,
          dataInicioEscala: true,
          filialId: true,
          setorId: true
        }
      });
      
      res.status(200).json(usuarios);
    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Erro interno ao listar colaboradores.' });
    }
  }
};
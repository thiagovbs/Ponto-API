import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export const SetorController = {
  // ➕ CADASTRAR SETOR
  async criar(req: Request, res: Response): Promise<void> {
    try {
      const { empresaId } = req;
      const { nome, filialId } = req.body;
      const administradorId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      if (!nome || !filialId) {
        res.status(400).json({ erro: 'Nome do departamento e Filial de alocação são obrigatórios.' });
        return;
      }

      // 🔒 Valida se a filial escolhida pertence de fato à empresa do Admin
      const filialValida = await prisma.filial.findFirst({
        where: { id: filialId, empresaId: empresaId! }
      });

      if (!filialValida) {
        res.status(400).json({ erro: 'A filial selecionada é inválida para sua organização.' });
        return;
      }

      const [novoSetor] = await prisma.$transaction([
        prisma.setor.create({
          data: {
            nome,
            filialId,
            empresaId: empresaId! // 🔒 Amarra ao Tenant Logado
          }
        }),
        prisma.logAuditoria.create({
          data: {
            acao: 'CREATE',
            entidade: 'Setor',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: {},
            dadosNovos: { nome, filialId, empresaId }
          }
        })
      ]);

      res.status(201).json(novoSetor);
    } catch (error) {
      console.error('Erro ao criar setor:', error);
      res.status(500).json({ erro: 'Erro interno ao processar cadastro de departamento.' });
    }
  },

  // 🔄 LISTAR SETORES COM INCLUDE DA FILIAL (EXATAMENTE COMO O SEU VUE ESPERA)
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { empresaId } = req;

      const setores = await prisma.setor.findMany({
        where: { empresaId: empresaId! }, // 🔒 Filtro SaaS
        include: {
          filial: {
            select: { nome: true } // 🟢 Traz o nome da filial para renderizar no badge da tabela do Vue
          }
        },
        orderBy: { nome: 'asc' }
      });

      res.status(200).json(setores);
    } catch (error) {
      console.error('Erro ao listar setores:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar setores.' });
    }
  },

  // ✏️ ATUALIZAR SETOR
  async atualizar(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { empresaId } = req;
      const { nome, filialId } = req.body;
      const administradorId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      const setorExistente = await prisma.setor.findFirst({
        where: { id, empresaId: empresaId! }
      });

      if (!setorExistente) {
        res.status(404).json({ erro: 'Setor não encontrado ou autorização negada.' });
        return;
      }

      // Se mudar de filial, valida a propriedade corporativa da nova filial
      if (filialId && filialId !== setorExistente.filialId) {
        const filialValida = await prisma.filial.findFirst({
          where: { id: filialId, empresaId: empresaId! }
        });
        if (!filialValida) {
          res.status(400).json({ erro: 'A nova filial selecionada é inválida.' });
          return;
        }
      }

      const [setorAtualizado] = await prisma.$transaction([
        prisma.setor.update({
          where: { id },
          data: {
            nome: nome || setorExistente.nome,
            filialId: filialId || setorExistente.filialId
          }
        }),
        prisma.logAuditoria.create({
          data: {
            acao: 'UPDATE',
            entidade: 'Setor',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: setorExistente as any,
            dadosNovos: { nome, filialId }
          }
        })
      ]);

      res.status(200).json(setorAtualizado);
    } catch (error) {
      console.error('Erro ao atualizar setor:', error);
      res.status(500).json({ erro: 'Erro interno ao atualizar parâmetros do setor.' });
    }
  },

  // ❌ DELETAR SETOR
  async deletar(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { empresaId } = req;
      const administradorId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      const setorExistente = await prisma.setor.findFirst({
        where: { id, empresaId: empresaId! }
      });

      if (!setorExistente) {
        res.status(404).json({ erro: 'Setor não encontrado na base de dados.' });
        return;
      }

      await prisma.$transaction([
        prisma.setor.delete({ where: { id } }),
        prisma.logAuditoria.create({
          data: {
            acao: 'DELETE',
            entidade: 'Setor',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: setorExistente as any,
            dadosNovos: {}
          }
        })
      ]);

      res.status(200).json({ mensagem: 'Setor deletado com sucesso.' });
    } catch (error) {
      console.error('Erro ao deletar setor:', error);
      res.status(500).json({ erro: 'Falha ao deletar setor da árvore estrutural.' });
    }
  }
};
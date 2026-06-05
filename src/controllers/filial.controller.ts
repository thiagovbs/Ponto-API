import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export const FilialController = {
  // ➕ CADASTRAR FILIAL
  async criar(req: Request, res: Response): Promise<void> {
    try {
      // 🛡️ CASTING ESTRITO: Garante que os dados do middleware e da rede sejam lidos de forma segura
      const empresaId = (req as any).empresaId as string;
      const { nome, cnpj } = req.body;
      const administradorId = (req as any).usuario?.id as string | undefined;
      const ip = (req.ip || req.socket.remoteAddress) as string | undefined;

      if (!nome || !cnpj) {
        res.status(400).json({ erro: 'Nome e CNPJ são campos obrigatórios.' });
        return;
      }

      // Valida se o CNPJ já não está cadastrado globalmente ou no tenant
      const cnpjExistente = await prisma.filial.findFirst({ where: { cnpj } });
      if (cnpjExistente) {
        res.status(400).json({ erro: 'Já existe uma filial registrada com este CNPJ.' });
        return;
      }

      const [novaFilial] = await prisma.$transaction([
        prisma.filial.create({
          data: {
            nome,
            cnpj,
            empresaId: empresaId // 🔒 Isolamento garantido
          }
        }),
        prisma.logAuditoria.create({
          data: {
            acao: 'CREATE',
            entidade: 'Filial',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: {},
            dadosNovos: { nome, cnpj, empresaId }
          }
        })
      ]);

      res.status(201).json(novaFilial);
    } catch (error) {
      console.error('Erro ao criar filial:', error);
      res.status(500).json({ erro: 'Erro interno ao processar cadastro de filial.' });
    }
  },

  // 🔄 LISTAR FILIAIS DA EMPRESA
  async listar(req: Request, res: Response): Promise<void> {
    try {
      // 🛡️ CASTING ESTRITO
      const empresaId = (req as any).empresaId as string;

      const filiais = await prisma.filial.findMany({
        where: { empresaId: empresaId }, // 🔒 Filtra apenas dados da empresa do Admin
        orderBy: { nome: 'asc' }
      });

      res.status(200).json(filiais);
    } catch (error) {
      console.error('Erro ao listar filiais:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar filiais.' });
    }
  },

  // ✏️ ATUALIZAR FILIAL
  async atualizar(req: Request, res: Response): Promise<void> {
    try {
      // 🛡️ CASTING ESTRITO: Evita o erro TS2322 (Type 'string | string[]' is not assignable to type 'string')
      const id = req.params.id as string;
      const empresaId = (req as any).empresaId as string;
      const { nome, cnpj } = req.body;
      const administradorId = (req as any).usuario?.id as string | undefined;
      const ip = (req.ip || req.socket.remoteAddress) as string | undefined;

      // 🔒 Segurança contra invasão entre Tenants
      const filialExistente = await prisma.filial.findFirst({
        where: { id, empresaId: empresaId }
      });

      if (!filialExistente) {
        res.status(404).json({ erro: 'Filial não encontrada ou não pertence à sua organização.' });
        return;
      }

      const [filialAtualizada] = await prisma.$transaction([
        prisma.filial.update({
          where: { id },
          data: {
            nome: nome || filialExistente.nome,
            cnpj: cnpj || filialExistente.cnpj
          }
        }),
        prisma.logAuditoria.create({
          data: {
            acao: 'UPDATE',
            entidade: 'Filial',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: filialExistente as any,
            dadosNovos: { nome, cnpj }
          }
        })
      ]);

      res.status(200).json(filialAtualizada);
    } catch (error) {
      console.error('Erro ao atualizar filial:', error);
      res.status(500).json({ erro: 'Erro interno ao atualizar filial.' });
    }
  },

  // ❌ DELETAR FILIAL
  async deletar(req: Request, res: Response): Promise<void> {
    try {
      // 🛡️ CASTING ESTRITO
      const id = req.params.id as string;
      const empresaId = (req as any).empresaId as string;
      const administradorId = (req as any).usuario?.id as string | undefined;
      const ip = (req.ip || req.socket.remoteAddress) as string | undefined;

      const filialExistente = await prisma.filial.findFirst({
        where: { id, empresaId: empresaId }
      });

      if (!filialExistente) {
        res.status(404).json({ erro: 'Filial não encontrada ou autorização negada.' });
        return;
      }

      await prisma.$transaction([
        prisma.filial.delete({ where: { id } }),
        prisma.logAuditoria.create({
          data: {
            acao: 'DELETE',
            entidade: 'Filial',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: filialExistente as any,
            dadosNovos: {}
          }
        })
      ]);

      res.status(200).json({ mensagem: 'Filial removida com sucesso.' });
    } catch (error) {
      console.error('Erro ao deletar filial:', error);
      res.status(500).json({ erro: 'Erro ao remover unidade. Certifique-se de que não há dependências ativas.' });
    }
  }
};
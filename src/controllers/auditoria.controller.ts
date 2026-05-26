import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export const AuditoriaController = {
  async listarLogs(req: Request, res: Response): Promise<void> {
    try {
      const logs = await prisma.logAuditoria.findMany({
        orderBy: { 
          dataHora: 'desc' 
        },
        include: {
          usuarioAcao: {
            select: {
              nome: true,
              cpf: true
            }
          }
        }
      });

      res.status(200).json(logs);
    } catch (error) {
      console.error('Erro ao listar logs de auditoria:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar logs de auditoria.' });
    }
  }
};